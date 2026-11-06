import { Prisma } from "@/generated/prisma/client";
import {
  checkInProblem,
  type CheckInCounts,
  type CheckInErrorCode,
  type CheckInPerson,
} from "@/lib/check-in";
import { prisma } from "@/lib/prisma";
import { verifyTicketCode } from "@/lib/tickets";
import { canManageEvent } from "@/server/services/events";
import type { CurrentUser } from "@/server/session";

type Staff = Pick<CurrentUser, "id" | "role">;

/** Why a check-in was turned down. The message is safe to show at the door. */
export class CheckInError extends Error {
  constructor(
    readonly code: CheckInErrorCode,
    message: string,
    /** Who the ticket belongs to, when that helps the coordinator decide what to do. */
    readonly person?: CheckInPerson,
  ) {
    super(message);
  }
}

const personSelect = {
  id: true,
  checkedInAt: true,
  team: { select: { name: true } },
  checkedInBy: { select: { name: true } },
  user: {
    select: {
      name: true,
      rollNo: true,
      photoUrl: true,
      year: true,
      department: { select: { code: true } },
    },
  },
} satisfies Prisma.RegistrationSelect;

function toPerson(
  r: Prisma.RegistrationGetPayload<{ select: typeof personSelect }>,
): CheckInPerson {
  return {
    registrationId: r.id,
    name: r.user.name,
    rollNo: r.user.rollNo,
    photoUrl: r.user.photoUrl,
    department: r.user.department?.code ?? null,
    year: r.user.year,
    team: r.team?.name ?? null,
    checkedInAt: r.checkedInAt?.toISOString() ?? null,
    checkedInBy: r.checkedInBy?.name ?? null,
  };
}

/** Registered people, not seats: a team sharing one seat still walks in one by one. */
export async function getCheckInCounts(eventId: string): Promise<CheckInCounts> {
  const confirmed = { eventId, status: "CONFIRMED" as const };
  const [registered, checkedIn] = await Promise.all([
    prisma.registration.count({ where: confirmed }),
    prisma.registration.count({ where: { ...confirmed, checkedInAt: { not: null } } }),
  ]);
  return { registered, checkedIn };
}

/** Everyone may only act on events they manage, and only while check-in is open. */
async function assertCheckInOpen(actor: Staff, eventId: string, now: Date) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      status: true,
      regOpensAt: true,
      regClosesAt: true,
      startsAt: true,
      endsAt: true,
      coordinators: { select: { userId: true } },
    },
  });
  if (!event || !canManageEvent(actor, event)) {
    throw new CheckInError("NOT_ALLOWED", "You don't manage this event.");
  }
  const problem = checkInProblem(event, now);
  if (problem) throw new CheckInError("CHECK_IN_CLOSED", problem);
}

const invalidTicket = () =>
  new CheckInError("INVALID_TICKET", "This isn't a valid ticket. Search for the person instead.");

/** Finds the registration a scanned or typed code belongs to, on this event. */
async function registrationIdFromTicket(eventId: string, input: string) {
  const code = verifyTicketCode(input);
  if (!code) throw invalidTicket();

  const found = await prisma.registration.findUnique({
    where: { ticketCode: code },
    select: { id: true, eventId: true, event: { select: { title: true } } },
  });
  if (!found) throw invalidTicket();
  if (found.eventId !== eventId) {
    throw new CheckInError("WRONG_EVENT", `This ticket is for ${found.event.title}.`);
  }
  return found.id;
}

export type CheckInTarget = { ticketCode: string } | { registrationId: string };

/**
 * Marks someone as attended, from a scanned ticket or a coordinator's search. The
 * update only applies to a confirmed registration not yet checked in, so two
 * phones scanning one ticket at the same moment can't both succeed.
 */
export async function checkIn(
  actor: Staff,
  eventId: string,
  target: CheckInTarget,
  now: Date,
): Promise<{ person: CheckInPerson; counts: CheckInCounts }> {
  await assertCheckInOpen(actor, eventId, now);

  const registrationId =
    "ticketCode" in target
      ? await registrationIdFromTicket(eventId, target.ticketCode)
      : target.registrationId;

  const person = await prisma.$transaction(async (tx) => {
    const { count } = await tx.registration.updateMany({
      where: { id: registrationId, eventId, status: "CONFIRMED", checkedInAt: null },
      data: { checkedInAt: now, checkedInById: actor.id },
    });

    const row = await tx.registration.findFirst({
      where: { id: registrationId, eventId },
      select: { ...personSelect, status: true },
    });
    if (!row) throw invalidTicket();
    if (row.status !== "CONFIRMED") {
      throw new CheckInError(
        "NOT_CONFIRMED",
        row.status === "WAITLISTED"
          ? `${row.user.name} is on the waitlist and has no seat.`
          : `${row.user.name} cancelled this registration.`,
      );
    }
    if (count === 0) {
      throw new CheckInError("ALREADY_CHECKED_IN", "Already checked in.", toPerson(row));
    }

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "registration.checked_in",
        entity: "registration",
        entityId: registrationId,
        meta: { eventId, via: "ticketCode" in target ? "ticket" : "search" },
      },
    });
    return toPerson(row);
  });

  return { person, counts: await getCheckInCounts(eventId) };
}

/** Takes back a check-in made by mistake. */
export async function undoCheckIn(
  actor: Staff,
  eventId: string,
  registrationId: string,
  now: Date,
): Promise<{ counts: CheckInCounts }> {
  await assertCheckInOpen(actor, eventId, now);

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.registration.updateMany({
      where: { id: registrationId, eventId, checkedInAt: { not: null } },
      data: { checkedInAt: null, checkedInById: null },
    });
    if (count === 0) throw new CheckInError("NOT_CHECKED_IN", "This person isn't checked in.");

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "registration.check_in_undone",
        entity: "registration",
        entityId: registrationId,
        meta: { eventId },
      },
    });
  });

  return { counts: await getCheckInCounts(eventId) };
}

/** Confirmed people matching a name, roll number or team, for when a scan isn't possible. */
export async function searchForCheckIn(eventId: string, q: string): Promise<CheckInPerson[]> {
  const contains = { contains: q, mode: "insensitive" as const };
  const rows = await prisma.registration.findMany({
    where: {
      eventId,
      status: "CONFIRMED",
      OR: [
        { user: { name: contains } },
        { user: { rollNo: contains } },
        { team: { name: contains } },
      ],
    },
    select: personSelect,
    orderBy: { user: { name: "asc" } },
    take: 20,
  });
  return rows.map(toPerson);
}

/** Events this person can check people in for: open now first, then what's next. */
export async function listCheckInEvents(actor: Staff, now: Date) {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const events = await prisma.event.findMany({
    where: {
      status: { notIn: ["DRAFT", "CANCELLED"] },
      endsAt: { gte: dayAgo },
      ...(actor.role === "ADMIN" ? {} : { coordinators: { some: { userId: actor.id } } }),
    },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
    take: 50,
    select: {
      id: true,
      title: true,
      subEvent: true,
      status: true,
      regOpensAt: true,
      regClosesAt: true,
      startsAt: true,
      endsAt: true,
      venue: { select: { name: true } },
      registrations: { where: { status: "CONFIRMED" }, select: { checkedInAt: true } },
    },
  });

  return events.map(({ registrations, ...event }) => ({
    ...event,
    closedReason: checkInProblem(event, now),
    registered: registrations.length,
    checkedIn: registrations.filter((r) => r.checkedInAt).length,
  }));
}
