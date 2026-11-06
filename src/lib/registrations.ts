import type { RegistrationStatus, Role } from "@/generated/prisma/enums";
import { effectiveStatus, isEligible, type EligibilityRow, type Schedule } from "@/lib/events";
import { formatDateTime } from "@/lib/time";

// Registration rules that need no database. The event page uses them to explain
// a disabled button and the service uses them to refuse the request, so what a
// student is told and what the server enforces can't drift apart.

export type RegistrationEvent = Schedule & { eligibility: EligibilityRow[] };

export type Applicant = {
  role: Role;
  emailVerified: boolean;
  rollNo: string | null;
  departmentId: string | null;
  year: number | null;
};

/** Why someone can't register. `fix` is a link to the page that solves it. */
export type Block = { message: string; fix?: { href: string; label: string } };

/** Why registration isn't open on this event right now, or null when it is. */
export function windowProblem(event: Schedule, now: Date): string | null {
  switch (effectiveStatus(event, now)) {
    case "DRAFT":
      return "This event isn't published yet.";
    case "CANCELLED":
      return "This event was cancelled.";
    case "COMPLETED":
      return "This event is over.";
    case "ONGOING":
      return "Registration closed when the event started.";
    case "REG_CLOSED":
      return "Registration has closed.";
    default:
      return now < event.regOpensAt
        ? `Registration opens ${formatDateTime(event.regOpensAt)}.`
        : null;
  }
}

/** Why this person can't join this event, whatever the dates, or null when they can. */
export function applicantProblem(event: RegistrationEvent, user: Applicant): Block | null {
  if (user.role !== "STUDENT") return { message: "Only student accounts can register." };
  if (!user.emailVerified) {
    return { message: "Verify your email first, using the link we sent you." };
  }
  if (!user.rollNo || !user.departmentId || !user.year) {
    return {
      message: "Add your roll number, department and year first.",
      fix: { href: "/profile", label: "Complete your profile" },
    };
  }
  if (!isEligible(event.eligibility, user)) {
    return { message: "This event isn't open to your department or year." };
  }
  return null;
}

/** The first reason this person can't register now, or null when they can. */
export function registrationBlock(
  event: RegistrationEvent,
  user: Applicant,
  now: Date,
): Block | null {
  const closed = windowProblem(event, now);
  return closed ? { message: closed } : applicantProblem(event, user);
}

/**
 * Cancelling, leaving and team changes are allowed until registration closes.
 * Unlike registering, they don't wait for the opening date, but nobody can hold
 * a place before then anyway.
 */
export function canChangeRegistration(event: Schedule, now: Date) {
  return effectiveStatus(event, now) === "PUBLISHED";
}

// ─── Teams ──────────────────────────────────────────────────────────────────

/** How many more people must accept before the team can register. */
export function membersNeeded(accepted: number, teamMin: number | null) {
  return Math.max(0, (teamMin ?? 1) - accepted);
}

/** Pending invites hold a place, so a leader can't invite more than can join. */
export function teamHasRoom(accepted: number, invited: number, teamMax: number | null) {
  return teamMax === null || accepted + invited < teamMax;
}

type TeamSettings = {
  participation: "SOLO" | "TEAM";
  teamMin: number | null;
  teamMax: number | null;
  seatPer: "TEAM" | "MEMBER";
};

/**
 * Why an edit to a running event can't be saved, or null when it can. Changing
 * these under people who have already joined would leave them in a state the
 * rules can't explain, such as a team larger than the maximum.
 */
export function eventEditProblem(
  current: TeamSettings,
  next: TeamSettings & { capacity: number | null },
  usage: { registrations: number; teams: number; seatsTaken: number },
): { field: string; message: string } | null {
  if (next.participation !== current.participation && usage.registrations + usage.teams > 0) {
    return {
      field: "participation",
      message: "People have already registered, so this can't change between solo and team.",
    };
  }
  if (usage.teams > 0) {
    const locked = "Teams have already formed, so this can't change.";
    if (next.teamMin !== current.teamMin) return { field: "teamMin", message: locked };
    if (next.teamMax !== current.teamMax) return { field: "teamMax", message: locked };
    if (next.seatPer !== current.seatPer) return { field: "seatPer", message: locked };
  }
  if (next.capacity !== null && next.capacity < usage.seatsTaken) {
    return {
      field: "capacity",
      message: `${usage.seatsTaken} seats are already taken, so the limit can't go below that.`,
    };
  }
  return null;
}

// ─── Waitlist ───────────────────────────────────────────────────────────────

export type WaitlistGroup = { position: number; seats: number };

/**
 * Turns waitlisted rows into places in the queue. A team's rows share a position;
 * it needs one seat in total, or one per person, depending on the event.
 */
export function waitlistGroups(positions: number[], teamSharesSeat: boolean): WaitlistGroup[] {
  const people = new Map<number, number>();
  for (const position of positions) people.set(position, (people.get(position) ?? 0) + 1);
  return [...people.entries()]
    .sort(([a], [b]) => a - b)
    .map(([position, count]) => ({ position, seats: teamSharesSeat ? 1 : count }));
}

/**
 * Who gets the free seats: the queue in order, each place that fits. A team too
 * big for the seats left stays at the front, and the next place that fits goes
 * in, so seats aren't left empty. `free` is null when the event has no limit.
 */
export function positionsToPromote(groups: WaitlistGroup[], free: number | null): number[] {
  if (free === null) return groups.map((g) => g.position);
  let left = free;
  const promoted: number[] = [];
  for (const group of groups) {
    if (group.seats <= left) {
      promoted.push(group.position);
      left -= group.seats;
    }
  }
  return promoted;
}

// ─── My events ──────────────────────────────────────────────────────────────

/** Sorts a student's registrations into the My events sections. */
export function groupMyEvents<
  T extends { status: RegistrationStatus; event: Schedule & { startsAt: Date } },
>(registrations: T[], now: Date) {
  const upcoming: T[] = [];
  const waitlisted: T[] = [];
  const past: T[] = [];

  for (const r of registrations) {
    if (r.status === "CANCELLED") continue;
    const status = effectiveStatus(r.event, now);
    if (status === "COMPLETED" || status === "CANCELLED") past.push(r);
    else if (r.status === "WAITLISTED") waitlisted.push(r);
    else upcoming.push(r);
  }

  const soonestFirst = (a: T, b: T) => a.event.startsAt.getTime() - b.event.startsAt.getTime();
  upcoming.sort(soonestFirst);
  waitlisted.sort(soonestFirst);
  past.sort((a, b) => soonestFirst(b, a));
  return { upcoming, waitlisted, past };
}
