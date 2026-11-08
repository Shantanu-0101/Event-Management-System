import { effectiveStatus, type Schedule } from "@/lib/events";
import { formatDateTime } from "@/lib/time";

// Check-in rules that need no database, shared by the server and the scanner page.

// ─── Ticket codes ───────────────────────────────────────────────────────────

/** Crockford base 32: no I, L, O or U, so a code read aloud or typed can't be misread. */
export const TICKET_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const TICKET_LENGTH = 16;

const TICKET_SHAPE = new RegExp(`^[${TICKET_ALPHABET}]{${TICKET_LENGTH}}$`);

/** Accepts how people type a code: any case, spaces or dashes, O for 0, I or L for 1. */
export function normalizeTicketCode(input: string) {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
}

// A code's spaces or dashes only ever fall between its groups of four.
const TICKET_GROUPS = /^\w{4}[\s-]?\w{4}[\s-]?\w{4}[\s-]?\w{4}$/;

/**
 * Whether a search box entry is a ticket code rather than a name or roll number. Length
 * alone isn't enough: "Onboarding Tester" has 16 valid letters, so without the check on
 * groups, searching for that person would report an invalid ticket.
 */
export function looksLikeTicketCode(input: string) {
  return TICKET_GROUPS.test(input.trim()) && TICKET_SHAPE.test(normalizeTicketCode(input));
}

/** "K7QM-3XRT-9PWA-HC2D": easier to read out and type than one long run. */
export function formatTicketCode(code: string) {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

// ─── When check-in is open ──────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Why people can't be checked in right now, or null when they can. Check-in opens
 * a day before the start, for rehearsals and early arrivals, and stays open for a
 * day after the end, so a coordinator can fix attendance before certificates go out.
 */
export function checkInProblem(event: Schedule, now: Date): string | null {
  const status = effectiveStatus(event, now);
  if (status === "DRAFT") return "This event isn't published yet.";
  if (status === "CANCELLED") return "This event was cancelled.";

  const opens = new Date(event.startsAt.getTime() - DAY_MS);
  if (now < opens) return `Check-in opens ${formatDateTime(opens)}.`;
  if (now.getTime() > event.endsAt.getTime() + DAY_MS) {
    return "Check-in closed a day after the event ended.";
  }
  return null;
}

// ─── What the check-in API sends the scanner page ───────────────────────────

export type CheckInCounts = { registered: number; checkedIn: number };

export type CheckInPerson = {
  registrationId: string;
  name: string;
  rollNo: string | null;
  photoUrl: string | null;
  department: string | null;
  year: number | null;
  team: string | null;
  /** ISO time, or null when not checked in. */
  checkedInAt: string | null;
  checkedInBy: string | null;
};

export type CheckInErrorCode =
  | "NOT_ALLOWED"
  | "INVALID_TICKET"
  | "WRONG_EVENT"
  | "NOT_CONFIRMED"
  | "ALREADY_CHECKED_IN"
  | "NOT_CHECKED_IN"
  | "CHECK_IN_CLOSED";

/** Share of a whole as a whole-number percent, or null when there's nothing to divide by. */
export function percent(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
