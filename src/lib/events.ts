import type { EventStatus, Participation, Role, SeatPer } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/time";

// Event rules that need no database, so they can be unit tested and shared by
// server code and client components.

export const STATUS_LABELS: Record<EventStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Open",
  REG_CLOSED: "Registration closed",
  ONGOING: "Happening now",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export type Schedule = {
  status: EventStatus;
  regOpensAt: Date;
  regClosesAt: Date;
  startsAt: Date;
  endsAt: Date;
};

/**
 * The status an event really has right now (spec section 5). Dates move it on
 * from Published to Registration closed, Ongoing and Completed. Worked out on
 * every read, because the scheduled job that saves these moves may run only
 * once a day; the event must not look open for hours after it closed.
 */
export function effectiveStatus(event: Schedule, now: Date): EventStatus {
  const { status } = event;
  if (status === "DRAFT" || status === "CANCELLED" || status === "COMPLETED") return status;
  if (now >= event.endsAt) return "COMPLETED";
  if (status === "ONGOING" || now >= event.startsAt) return "ONGOING";
  if (status === "REG_CLOSED" || now >= event.regClosesAt) return "REG_CLOSED";
  return "PUBLISHED";
}

/** Finished and cancelled events are a record; they can't be changed. */
export function isEditable(event: Schedule, now: Date) {
  const status = effectiveStatus(event, now);
  return status !== "COMPLETED" && status !== "CANCELLED";
}

export type StatusAction = "publish" | "close" | "reopen" | "cancel";

export const ACTION_TARGET: Record<StatusAction, EventStatus> = {
  publish: "PUBLISHED",
  close: "REG_CLOSED",
  reopen: "PUBLISHED",
  cancel: "CANCELLED",
};

/** Why a draft can't be published yet, or null when it can. */
export function publishProblem(event: Schedule, now: Date): string | null {
  if (event.regClosesAt <= now) {
    return "Its registration window is already over. Set new dates first.";
  }
  return null;
}

/** The status changes this person may make on this event right now. */
export function statusActions(event: Schedule, role: Role, now: Date): StatusAction[] {
  const status = effectiveStatus(event, now);

  // Coordinators may only close registration on their events.
  if (role === "COORDINATOR") return status === "PUBLISHED" ? ["close"] : [];
  if (role !== "ADMIN") return [];

  switch (status) {
    case "DRAFT":
      return publishProblem(event, now) ? ["cancel"] : ["publish", "cancel"];
    case "PUBLISHED":
      return ["close", "cancel"];
    case "REG_CLOSED":
      // Reopening only makes sense while the window is still running; an admin
      // who extended the dates of a closed event uses this to open it again.
      return event.regClosesAt > now ? ["reopen", "cancel"] : ["cancel"];
    default:
      return [];
  }
}

export type EligibilityRow = { departmentId: string | null; year: number | null };

/**
 * The rows to store for the ticked departments and years. An empty side means
 * "any", stored as null. No rows at all means the event is open to everyone.
 */
export function eligibilityRows(departmentIds: string[], years: number[]): EligibilityRow[] {
  if (departmentIds.length === 0 && years.length === 0) return [];
  const departments = departmentIds.length > 0 ? departmentIds : [null];
  const yearValues = years.length > 0 ? years : [null];
  return departments.flatMap((departmentId) => yearValues.map((year) => ({ departmentId, year })));
}

/** Turns stored rows back into the ticked departments and years. */
export function eligibilityChoice(rows: EligibilityRow[]) {
  const nonNull = <T>(v: T | null): v is T => v !== null;
  return {
    departmentIds: [...new Set(rows.map((r) => r.departmentId).filter(nonNull))],
    years: [...new Set(rows.map((r) => r.year).filter(nonNull))].sort((a, b) => a - b),
  };
}

/** Whether a student may join: no rows, or any row matching them. */
export function isEligible(
  rows: EligibilityRow[],
  student: { departmentId: string | null; year: number | null },
) {
  if (rows.length === 0) return true;
  return rows.some(
    (r) =>
      (r.departmentId === null || r.departmentId === student.departmentId) &&
      (r.year === null || r.year === student.year),
  );
}

type SeatRule = { participation: Participation; seatPer: SeatPer };

/** True when a whole team shares one seat, rather than each person taking one. */
export function teamSharesSeat(event: SeatRule) {
  return event.participation === "TEAM" && event.seatPer === "TEAM";
}

/** Seats in use, from counts of confirmed registrations and of confirmed teams. */
export function seatsTaken(event: SeatRule & { _count: { registrations: number; teams: number } }) {
  return teamSharesSeat(event) ? event._count.teams : event._count.registrations;
}

/** Seats still free, or null when the event has no limit. Never below zero. */
export function seatsLeft(capacity: number | null, taken: number) {
  return capacity === null ? null : Math.max(0, capacity - taken);
}

/** A sentence about the registration window, for the event page. */
export function registrationNote(event: Schedule, now: Date): string {
  switch (effectiveStatus(event, now)) {
    case "PUBLISHED":
      return now < event.regOpensAt
        ? `Opens ${formatDateTime(event.regOpensAt)}`
        : `Open until ${formatDateTime(event.regClosesAt)}`;
    case "DRAFT":
      return `Planned from ${formatDateTime(event.regOpensAt)} to ${formatDateTime(event.regClosesAt)}`;
    default:
      return "Closed";
  }
}
