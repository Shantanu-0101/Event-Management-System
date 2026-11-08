import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import type { RegistrationStatus } from "@/generated/prisma/enums";
import type { Email } from "@/lib/email";
import { isEligible, teamSharesSeat } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import {
  confirmedEmail,
  eventCancelledEmail,
  inviteDeclinedEmail,
  memberLeftEmail,
  promotedEmail,
  removedFromTeamEmail,
  teamBelowMinimumEmail,
  teamConfirmedEmail,
  teamDisbandedEmail,
  teamInviteEmail,
  teamWaitlistedEmail,
  waitlistedEmail,
} from "@/lib/registration-emails";
import {
  canChangeRegistration,
  membersNeeded,
  positionsToPromote,
  registrationBlock,
  teamHasRoom,
  waitlistGroups,
  windowProblem,
  type Applicant,
} from "@/lib/registrations";
import { newTicketCode } from "@/lib/tickets";

// How a seat can never be sold twice: every change that touches seats first
// locks the event's row, so changes to one event happen one at a time and each
// sees the counts the last one left. Different events don't wait for each other.
//
// Services return the emails to send instead of sending them, so a slow mail
// provider can't hold the lock, and nothing is sent if the transaction fails.

/** A registration rule was broken; the message is safe to show to the user. */
export class RegistrationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

type Tx = Prisma.TransactionClient;
type Student = Applicant & { id: string; name: string; email: string };
export type Outcome = { emails: Email[] };

const ACTIVE: RegistrationStatus[] = ["CONFIRMED", "WAITLISTED"];

// A busy event queues many transactions behind one lock. Prisma's defaults (wait
// 2 s for a connection, 5 s to finish) would fail people who only had to wait.
export const LOCKED_TRANSACTION = { maxWait: 15_000, timeout: 30_000 };

/** Takes the event's lock until the transaction ends, then reads it. */
export async function lockEvent(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM events WHERE id = ${id} FOR UPDATE`;
  return tx.event.findUnique({
    where: { id },
    include: {
      eligibility: { select: { departmentId: true, year: true } },
      venue: { select: { name: true, building: true } },
    },
  });
}

type LockedEvent = NonNullable<Awaited<ReturnType<typeof lockEvent>>>;

async function withLockedEvent<T>(
  eventId: string,
  work: (tx: Tx, event: LockedEvent) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      const event = await lockEvent(tx, eventId);
      if (!event) throw new RegistrationError("This event no longer exists.");
      return work(tx, event);
    }, LOCKED_TRANSACTION);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
      throw new RegistrationError("Lots of people are registering right now. Try again.");
    }
    throw e;
  }
}

const teamInclude = {
  leader: { select: { id: true, name: true, email: true } },
  members: { include: { user: { select: { id: true, name: true, email: true } } } },
} satisfies Prisma.TeamInclude;

type LockedTeam = Prisma.TeamGetPayload<{ include: typeof teamInclude }>;

async function withLockedTeam<T>(
  teamId: string,
  work: (tx: Tx, event: LockedEvent, team: LockedTeam) => Promise<T>,
): Promise<T> {
  const gone = "This team no longer exists.";
  const found = await prisma.team.findUnique({ where: { id: teamId }, select: { eventId: true } });
  if (!found) throw new RegistrationError(gone);

  return withLockedEvent(found.eventId, async (tx, event) => {
    // Read again now the lock is held: the team may have just been disbanded.
    const team = await tx.team.findUnique({ where: { id: teamId }, include: teamInclude });
    if (!team) throw new RegistrationError(gone);
    return work(tx, event, team);
  });
}

function assertCanChange(event: LockedEvent, now: Date) {
  if (!canChangeRegistration(event, now)) {
    throw new RegistrationError(windowProblem(event, now) ?? "Registration has closed.");
  }
}

function assertCanJoin(event: LockedEvent, student: Student, now: Date) {
  const block = registrationBlock(event, student, now);
  if (block) throw new RegistrationError(block.message);
}

function audit(
  tx: Tx,
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  meta?: Prisma.InputJsonValue,
) {
  return tx.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
}

// ─── Seats and the waitlist ─────────────────────────────────────────────────

async function countSeatsTaken(tx: Tx, event: LockedEvent) {
  return teamSharesSeat(event)
    ? tx.team.count({
        where: { eventId: event.id, registrations: { some: { status: "CONFIRMED" } } },
      })
    : tx.registration.count({ where: { eventId: event.id, status: "CONFIRMED" } });
}

/** Seats free right now, or null when the event has no limit. */
async function freeSeats(tx: Tx, event: LockedEvent) {
  if (event.capacity === null) return null;
  return Math.max(0, event.capacity - (await countSeatsTaken(tx, event)));
}

/** The place a new registration gets: a confirmed seat, or the back of the queue. */
async function nextPlace(tx: Tx, event: LockedEvent, seats: number) {
  const free = await freeSeats(tx, event);
  if (free === null || free >= seats) {
    return { status: "CONFIRMED" as const, waitlistPosition: null };
  }
  const { _max } = await tx.registration.aggregate({
    where: { eventId: event.id },
    _max: { waitlistPosition: true },
  });
  return { status: "WAITLISTED" as const, waitlistPosition: (_max.waitlistPosition ?? 0) + 1 };
}

/** What to save for one person taking a place. Everyone confirmed has their own ticket. */
function withTicket(place: { status: RegistrationStatus; waitlistPosition: number | null }) {
  return { ...place, ticketCode: place.status === "CONFIRMED" ? newTicketCode() : null };
}

/** Ends registrations. A cancelled row keeps nothing that could still get someone in. */
function release(tx: Tx, where: Prisma.RegistrationWhereInput) {
  return tx.registration.updateMany({
    where: { ...where, status: { in: ACTIVE } },
    data: {
      status: "CANCELLED",
      waitlistPosition: null,
      ticketCode: null,
      teamId: null,
      checkedInAt: null,
      checkedInById: null,
    },
  });
}

/**
 * Gives free seats to the waitlist, first come first served. Runs after anything
 * that frees seats. Callers must hold the event's lock.
 */
export async function promoteWaitlist(tx: Tx, event: LockedEvent): Promise<Email[]> {
  const waiting = await tx.registration.findMany({
    where: { eventId: event.id, status: "WAITLISTED" },
    select: {
      id: true,
      waitlistPosition: true,
      user: { select: { id: true, name: true, email: true } },
      team: { select: { name: true } },
    },
  });
  if (waiting.length === 0) return [];

  const groups = waitlistGroups(
    waiting.map((r) => r.waitlistPosition ?? 0),
    teamSharesSeat(event),
  );
  const promoted = positionsToPromote(groups, await freeSeats(tx, event));
  if (promoted.length === 0) return [];

  const confirmed = waiting.filter((r) => promoted.includes(r.waitlistPosition ?? 0));
  // One update each, because every person gets a different ticket.
  const emails: Email[] = [];
  for (const r of confirmed) {
    const ticketCode = newTicketCode();
    await tx.registration.update({
      where: { id: r.id },
      data: { status: "CONFIRMED", waitlistPosition: null, ticketCode },
    });
    emails.push(promotedEmail(r.user, event, { id: r.id, ticketCode }, r.team?.name));
  }
  return emails;
}

// ─── Solo registration ──────────────────────────────────────────────────────

/** Registers a student for a solo event: a confirmed seat, or the waitlist when it's full. */
export async function registerForEvent(student: Student, eventId: string, now: Date) {
  return withLockedEvent(eventId, async (tx, event) => {
    if (event.participation !== "SOLO") {
      throw new RegistrationError("This is a team event. Create or join a team to take part.");
    }
    assertCanJoin(event, student, now);

    const where = { eventId_userId: { eventId, userId: student.id } };
    const existing = await tx.registration.findUnique({ where, select: { status: true } });
    if (existing?.status === "CONFIRMED") {
      throw new RegistrationError("You're already registered for this event.");
    }
    if (existing?.status === "WAITLISTED") {
      throw new RegistrationError("You're already on the waitlist for this event.");
    }

    const place = await nextPlace(tx, event, 1);
    const saved = withTicket(place);
    // Someone who cancelled has a row already; it's reused, at the back of the queue.
    const registration = await tx.registration.upsert({
      where,
      create: { eventId, userId: student.id, ...saved },
      update: saved,
    });
    await audit(tx, student.id, "registration.created", "registration", registration.id, {
      eventId,
      status: place.status,
    });
    return {
      status: place.status,
      emails: [
        place.status === "CONFIRMED"
          ? confirmedEmail(student, event, registration)
          : waitlistedEmail(student, event),
      ],
    };
  });
}

/** Cancels a solo registration or waitlist place, and promotes the next in line. */
export async function cancelRegistration(
  user: { id: string },
  eventId: string,
  now: Date,
): Promise<Outcome> {
  return withLockedEvent(eventId, async (tx, event) => {
    const registration = await tx.registration.findUnique({
      where: { eventId_userId: { eventId, userId: user.id } },
      select: { id: true, status: true, teamId: true },
    });
    if (!registration || registration.status === "CANCELLED") {
      throw new RegistrationError("You aren't registered for this event.");
    }
    if (registration.teamId) {
      throw new RegistrationError("You're registered through a team. Leave the team instead.");
    }
    assertCanChange(event, now);

    await release(tx, { id: registration.id });
    await audit(tx, user.id, "registration.cancelled", "registration", registration.id, {
      eventId,
    });
    return { emails: await promoteWaitlist(tx, event) };
  });
}

// ─── Teams ──────────────────────────────────────────────────────────────────

/** The name of a different team this student is already on for this event, or null. */
async function otherTeamName(tx: Tx, eventId: string, userId: string, teamId?: string) {
  const other = await tx.teamMember.findFirst({
    where: {
      userId,
      status: "ACCEPTED",
      team: { eventId, ...(teamId ? { id: { not: teamId } } : {}) },
    },
    select: { team: { select: { name: true } } },
  });
  return other?.team.name ?? null;
}

/**
 * Makes a team's registrations match its accepted members. It registers when it
 * reaches the minimum size, gives later joiners the same place, and loses its
 * place when it drops below the minimum. Callers must hold the event's lock.
 */
async function syncTeamRegistration(
  tx: Tx,
  event: LockedEvent,
  team: { id: string; name: string },
): Promise<Email[]> {
  const accepted = await tx.teamMember.findMany({
    where: { teamId: team.id, status: "ACCEPTED" },
    select: { userId: true, user: { select: { id: true, name: true, email: true } } },
  });
  const current = await tx.registration.findMany({
    where: { teamId: team.id, status: { in: ACTIVE } },
    select: { userId: true, status: true, waitlistPosition: true },
  });

  if (membersNeeded(accepted.length, event.teamMin) > 0) {
    if (current.length === 0) return [];
    await release(tx, { teamId: team.id });
    return accepted.map((m) => teamBelowMinimumEmail(m.user, event, team.name, event.teamMin ?? 1));
  }

  const [first] = current;
  const place = first
    ? { status: first.status, waitlistPosition: first.waitlistPosition }
    : await nextPlace(tx, event, teamSharesSeat(event) ? 1 : accepted.length);

  const registered = new Set(current.map((r) => r.userId));
  const joining = accepted.filter((m) => !registered.has(m.userId));
  const emails: Email[] = [];
  for (const { userId, user } of joining) {
    const saved = withTicket(place);
    const registration = await tx.registration.upsert({
      where: { eventId_userId: { eventId: event.id, userId } },
      create: { eventId: event.id, userId, teamId: team.id, ...saved },
      update: { teamId: team.id, ...saved },
    });
    emails.push(
      place.status === "CONFIRMED"
        ? teamConfirmedEmail(user, event, team.name, registration)
        : teamWaitlistedEmail(user, event, team.name),
    );
  }
  return emails;
}

/** Starts a team on a team event, with the student as its leader. */
export async function createTeam(
  student: Student,
  eventId: string,
  name: string,
  now: Date,
): Promise<Outcome & { teamId: string }> {
  return withLockedEvent(eventId, async (tx, event) => {
    if (event.participation !== "TEAM") {
      throw new RegistrationError("This event is for individuals, not teams.");
    }
    assertCanJoin(event, student, now);

    const onTeam = await otherTeamName(tx, eventId, student.id);
    if (onTeam) {
      throw new RegistrationError(`You're already on team ${onTeam}. Leave it to start another.`);
    }
    const taken = await tx.team.count({
      where: { eventId, name: { equals: name, mode: "insensitive" } },
    });
    if (taken) throw new RegistrationError("Another team already has that name.", "name");

    const team = await tx.team.create({
      data: {
        eventId,
        name,
        leaderId: student.id,
        inviteCode: randomBytes(9).toString("base64url"),
        members: { create: { userId: student.id, status: "ACCEPTED" } },
      },
    });
    // They've picked a team, so other invites for this event no longer apply.
    await tx.teamMember.updateMany({
      where: { userId: student.id, status: "INVITED", team: { eventId } },
      data: { status: "DECLINED" },
    });
    await audit(tx, student.id, "team.created", "team", team.id, { eventId, name });

    return { teamId: team.id, emails: await syncTeamRegistration(tx, event, team) };
  });
}

/** The leader invites a student by roll number or email. */
export async function inviteToTeam(
  leader: { id: string; name: string },
  teamId: string,
  rollNoOrEmail: string,
  now: Date,
): Promise<Outcome> {
  return withLockedTeam(teamId, async (tx, event, team) => {
    if (team.leaderId !== leader.id) {
      throw new RegistrationError("Only the team leader can invite members.");
    }
    const closed = windowProblem(event, now);
    if (closed) throw new RegistrationError(closed);

    const search = rollNoOrEmail.trim();
    const invitee = await tx.user.findFirst({
      where: {
        isActive: true,
        role: "STUDENT",
        OR: [{ rollNo: search.toUpperCase() }, { email: search.toLowerCase() }],
      },
      select: { id: true, name: true, email: true, departmentId: true, year: true },
    });
    const fail = (message: string) => new RegistrationError(message, "member");

    if (!invitee) throw fail("No student account has that roll number or email.");
    if (invitee.id === leader.id) throw fail("You're already on this team.");
    if (!isEligible(event.eligibility, invitee)) {
      throw fail(`${invitee.name} isn't eligible for this event.`);
    }
    const onTeam = await otherTeamName(tx, event.id, invitee.id, team.id);
    if (onTeam) throw fail(`${invitee.name} is already on another team.`);

    const existing = team.members.find((m) => m.userId === invitee.id);
    if (existing?.status === "ACCEPTED") throw fail(`${invitee.name} is already on this team.`);
    if (existing?.status === "INVITED") throw fail(`${invitee.name} has already been invited.`);

    const accepted = team.members.filter((m) => m.status === "ACCEPTED").length;
    const invited = team.members.filter((m) => m.status === "INVITED").length;
    if (!teamHasRoom(accepted, invited, event.teamMax)) {
      throw fail(
        `A team can have at most ${event.teamMax} members, counting pending invites. Remove one first.`,
      );
    }

    // Someone who declined earlier can be asked again.
    await tx.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: invitee.id } },
      create: { teamId, userId: invitee.id, status: "INVITED" },
      update: { status: "INVITED" },
    });
    await audit(tx, leader.id, "team.invited", "team", teamId, { userId: invitee.id });

    return { emails: [teamInviteEmail(invitee, event, team.name, leader.name)] };
  });
}

/** A student accepts or declines an invite. Accepting can complete the team's registration. */
export async function respondToInvite(
  student: Student,
  teamId: string,
  accept: boolean,
  now: Date,
): Promise<Outcome> {
  return withLockedTeam(teamId, async (tx, event, team) => {
    const member = team.members.find((m) => m.userId === student.id);
    if (member?.status !== "INVITED") {
      throw new RegistrationError("This invite is no longer open.");
    }
    const where = { teamId_userId: { teamId, userId: student.id } };

    if (!accept) {
      await tx.teamMember.update({ where, data: { status: "DECLINED" } });
      await audit(tx, student.id, "team.declined", "team", teamId);
      return { emails: [inviteDeclinedEmail(team.leader, event, team.name, student.name)] };
    }

    assertCanJoin(event, student, now);
    const onTeam = await otherTeamName(tx, event.id, student.id, teamId);
    if (onTeam) {
      throw new RegistrationError(`You're already on team ${onTeam}. Leave it to join this one.`);
    }
    const accepted = team.members.filter((m) => m.status === "ACCEPTED").length;
    if (event.teamMax !== null && accepted >= event.teamMax) {
      throw new RegistrationError("This team is already full.");
    }

    // One more person on a confirmed team needs a seat of their own when each
    // member takes one. Splitting the team across the waitlist would be worse.
    if (!teamSharesSeat(event)) {
      const confirmed = await tx.registration.count({ where: { teamId, status: "CONFIRMED" } });
      if (confirmed > 0 && (await freeSeats(tx, event)) === 0) {
        throw new RegistrationError("This event has no seats left for another team member.");
      }
    }

    await tx.teamMember.update({ where, data: { status: "ACCEPTED" } });
    await tx.teamMember.updateMany({
      where: {
        userId: student.id,
        status: "INVITED",
        team: { eventId: event.id, id: { not: teamId } },
      },
      data: { status: "DECLINED" },
    });
    await audit(tx, student.id, "team.accepted", "team", teamId);

    return { emails: await syncTeamRegistration(tx, event, team) };
  });
}

/** Takes someone off a team, then settles the team's registration and the waitlist. */
async function dropMember(tx: Tx, event: LockedEvent, team: LockedTeam, userId: string) {
  await tx.teamMember.delete({ where: { teamId_userId: { teamId: team.id, userId } } });
  await release(tx, { eventId: event.id, userId, teamId: team.id });
  const synced = await syncTeamRegistration(tx, event, team);
  return [...synced, ...(await promoteWaitlist(tx, event))];
}

/** The leader removes a member, or withdraws an invite. */
export async function removeTeamMember(
  leader: { id: string },
  teamId: string,
  userId: string,
  now: Date,
): Promise<Outcome> {
  return withLockedTeam(teamId, async (tx, event, team) => {
    if (team.leaderId !== leader.id) {
      throw new RegistrationError("Only the team leader can remove members.");
    }
    if (userId === leader.id) {
      throw new RegistrationError("You lead this team. Disband it instead.");
    }
    const member = team.members.find((m) => m.userId === userId);
    if (!member) throw new RegistrationError("That person isn't on this team.");
    assertCanChange(event, now);

    const emails = await dropMember(tx, event, team, userId);
    await audit(tx, leader.id, "team.member_removed", "team", teamId, { userId });

    return member.status === "ACCEPTED"
      ? { emails: [removedFromTeamEmail(member.user, event, team.name), ...emails] }
      : { emails };
  });
}

/** A member leaves. The leader can't: they disband the team instead. */
export async function leaveTeam(
  user: { id: string; name: string },
  teamId: string,
  now: Date,
): Promise<Outcome> {
  return withLockedTeam(teamId, async (tx, event, team) => {
    const member = team.members.find((m) => m.userId === user.id);
    if (member?.status !== "ACCEPTED") {
      throw new RegistrationError("You aren't on this team.");
    }
    if (team.leaderId === user.id) {
      throw new RegistrationError("You lead this team. Disband it instead.");
    }
    assertCanChange(event, now);

    const emails = await dropMember(tx, event, team, user.id);
    await audit(tx, user.id, "team.member_left", "team", teamId);

    return { emails: [memberLeftEmail(team.leader, event, team.name, user.name), ...emails] };
  });
}

/** The leader ends the team: everyone's registration is cancelled and the name is free again. */
export async function disbandTeam(
  leader: { id: string },
  teamId: string,
  now: Date,
): Promise<Outcome> {
  return withLockedTeam(teamId, async (tx, event, team) => {
    if (team.leaderId !== leader.id) {
      throw new RegistrationError("Only the team leader can disband the team.");
    }
    assertCanChange(event, now);

    await release(tx, { teamId });
    await tx.team.delete({ where: { id: teamId } });
    await audit(tx, leader.id, "team.disbanded", "team", teamId, {
      eventId: event.id,
      name: team.name,
    });

    const others = team.members.filter((m) => m.status === "ACCEPTED" && m.userId !== leader.id);
    return {
      emails: [
        ...others.map((m) => teamDisbandedEmail(m.user, event, team.name)),
        ...(await promoteWaitlist(tx, event)),
      ],
    };
  });
}

// ─── Event cancelled ────────────────────────────────────────────────────────

/** Everyone who needs to hear about this event: holding a place, or on a team still forming. */
export function eventAudience(db: Tx, eventId: string) {
  return db.user.findMany({
    where: {
      isActive: true,
      OR: [
        { registrations: { some: { eventId, status: { in: ACTIVE } } } },
        { teamMemberships: { some: { status: "ACCEPTED", team: { eventId } } } },
      ],
    },
    select: { id: true, name: true, email: true },
  });
}

export async function eventCancelledEmails(
  tx: Tx,
  event: { id: string; title: string; slug: string },
) {
  const people = await eventAudience(tx, event.id);
  return people.map((person) => eventCancelledEmail(person, event));
}

// ─── Reading ────────────────────────────────────────────────────────────────

/** Where someone stands in the queue: 1 is next. A team counts as one place. */
async function waitlistRank(eventId: string, position: number | null) {
  if (position === null) return null;
  const ahead = await prisma.registration.findMany({
    where: { eventId, status: "WAITLISTED", waitlistPosition: { lt: position } },
    distinct: ["waitlistPosition"],
    select: { waitlistPosition: true },
  });
  return ahead.length + 1;
}

/** What the event page needs to show one student where they stand. */
export async function getRegistrationView(eventId: string, userId: string) {
  const [registration, team, invites] = await Promise.all([
    prisma.registration.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { id: true, status: true, waitlistPosition: true, checkedInAt: true },
    }),
    prisma.team.findFirst({
      where: { eventId, members: { some: { userId, status: "ACCEPTED" } } },
      select: {
        id: true,
        name: true,
        leaderId: true,
        members: {
          where: { status: { in: ["ACCEPTED", "INVITED"] } },
          orderBy: { createdAt: "asc" },
          select: {
            userId: true,
            status: true,
            user: { select: { name: true, rollNo: true } },
          },
        },
      },
    }),
    prisma.teamMember.findMany({
      where: { userId, status: "INVITED", team: { eventId } },
      orderBy: { createdAt: "asc" },
      select: { team: { select: { id: true, name: true, leader: { select: { name: true } } } } },
    }),
  ]);

  const active = registration && registration.status !== "CANCELLED" ? registration : null;
  return {
    registration: active,
    waitlistRank: await waitlistRank(eventId, active?.waitlistPosition ?? null),
    team,
    invites: invites.map((i) => i.team),
  };
}

const myEventSelect = {
  id: true,
  title: true,
  slug: true,
  subEvent: true,
  status: true,
  startsAt: true,
  endsAt: true,
  regOpensAt: true,
  regClosesAt: true,
  teamMin: true,
  category: { select: { name: true } },
  venue: { select: { name: true } },
} satisfies Prisma.EventSelect;

/** Everything on a student's My events page, not yet sorted into sections. */
export async function getMyEvents(userId: string) {
  const [registrations, invites, teams] = await Promise.all([
    prisma.registration.findMany({
      where: { userId, status: { in: ACTIVE } },
      select: {
        id: true,
        status: true,
        waitlistPosition: true,
        checkedInAt: true,
        event: {
          select: {
            ...myEventSelect,
            feedback: { where: { userId }, select: { id: true } },
          },
        },
        team: { select: { name: true } },
        certificates: { orderBy: { type: "asc" }, select: { id: true, type: true } },
      },
    }),
    prisma.teamMember.findMany({
      where: { userId, status: "INVITED" },
      orderBy: { createdAt: "desc" },
      select: {
        team: {
          select: {
            id: true,
            name: true,
            leader: { select: { name: true } },
            event: { select: myEventSelect },
          },
        },
      },
    }),
    // Teams still short of members hold no registration yet.
    prisma.team.findMany({
      where: {
        members: { some: { userId, status: "ACCEPTED" } },
        registrations: { none: { userId, status: { in: ACTIVE } } },
      },
      select: {
        id: true,
        name: true,
        event: { select: myEventSelect },
        _count: { select: { members: { where: { status: "ACCEPTED" } } } },
      },
    }),
  ]);

  const withRanks = await Promise.all(
    registrations.map(async (r) => ({
      ...r,
      waitlistRank: await waitlistRank(r.event.id, r.waitlistPosition),
    })),
  );
  return { registrations: withRanks, invites: invites.map((i) => i.team), teams };
}

const ticketSelect = {
  id: true,
  status: true,
  ticketCode: true,
  checkedInAt: true,
  team: { select: { name: true } },
  user: { select: { name: true, rollNo: true } },
  event: {
    select: {
      title: true,
      slug: true,
      subEvent: true,
      status: true,
      startsAt: true,
      endsAt: true,
      regOpensAt: true,
      regClosesAt: true,
      venue: { select: { name: true, building: true } },
    },
  },
} satisfies Prisma.RegistrationSelect;

/**
 * One student's own ticket, or null if this registration isn't theirs. People
 * confirmed before tickets existed get theirs here, the first time they ask for it.
 */
export async function getTicket(registrationId: string, userId: string) {
  const where = { id: registrationId, userId };
  const ticket = await prisma.registration.findFirst({ where, select: ticketSelect });
  if (ticket?.status !== "CONFIRMED" || ticket.ticketCode) return ticket;

  await prisma.registration.updateMany({
    where: { ...where, status: "CONFIRMED", ticketCode: null },
    data: { ticketCode: newTicketCode() },
  });
  return prisma.registration.findFirst({ where, select: ticketSelect });
}
