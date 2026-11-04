// All event times are India time, whatever timezone the server or the viewer's
// phone is in. Vercel's servers run on UTC, so reading "2026-11-20T10:00" from a
// form without this would store 10:00 UTC, which is 15:30 at the college.
// India has no daylight saving, so the offset never changes.

const TIME_ZONE = "Asia/Kolkata";
const OFFSET = "+05:30";
const OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

const valid = (d: Date) => (Number.isNaN(d.getTime()) ? null : d);

/** "2026-11-20T10:00" from a datetime-local input, read as India time. */
export function parseLocalDateTime(value: string): Date | null {
  if (!LOCAL_DATE_TIME.test(value)) return null;
  return valid(new Date(`${value}:00${OFFSET}`));
}

/** The value a datetime-local input needs to show this moment in India time. */
export function toLocalInput(date: Date): string {
  return new Date(date.getTime() + OFFSET_MS).toISOString().slice(0, 16);
}

/** The first moment of "2026-11-20" in India time. */
export function startOfLocalDay(value: string): Date | null {
  if (!LOCAL_DATE.test(value)) return null;
  return valid(new Date(`${value}T00:00:00${OFFSET}`));
}

/** The last moment of "2026-11-20" in India time. */
export function endOfLocalDay(value: string): Date | null {
  if (!LOCAL_DATE.test(value)) return null;
  return valid(new Date(`${value}T23:59:59.999${OFFSET}`));
}

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });

/** "Fri, 20 Nov 2026" */
export const formatDate = (date: Date) => dateFormat.format(date);

/** "10:00 am" */
export const formatTime = (date: Date) => timeFormat.format(date);

/** "Fri, 20 Nov 2026, 10:00 am" */
export const formatDateTime = (date: Date) => `${formatDate(date)}, ${formatTime(date)}`;

/** One line for an event's schedule; a same-day event shows its date once. */
export function formatRange(start: Date, end: Date) {
  return dayKey.format(start) === dayKey.format(end)
    ? `${formatDateTime(start)} – ${formatTime(end)}`
    : `${formatDateTime(start)} – ${formatDateTime(end)}`;
}
