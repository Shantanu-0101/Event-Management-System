import { z } from "zod";
import type { RegistrationStatus } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/time";

// The per-event registrations table and its exports read the same filters, so an
// export always holds exactly what the coordinator was looking at.

export const STATUS_FILTERS = ["ACTIVE", "CONFIRMED", "WAITLISTED", "CANCELLED"] as const;
export const ATTENDANCE_FILTERS = ["ALL", "CHECKED_IN", "NOT_CHECKED_IN"] as const;

export const STATUS_FILTER_LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  ACTIVE: "Registered and waitlist",
  CONFIRMED: "Registered",
  WAITLISTED: "Waitlist",
  CANCELLED: "Cancelled",
};

export const ATTENDANCE_FILTER_LABELS: Record<(typeof ATTENDANCE_FILTERS)[number], string> = {
  ALL: "Any attendance",
  CHECKED_IN: "Checked in",
  NOT_CHECKED_IN: "Not checked in",
};

// Addresses can hold anything. A value that doesn't make sense falls back to "no filter".
const filterSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum(STATUS_FILTERS).catch("ACTIVE"),
  attendance: z.enum(ATTENDANCE_FILTERS).catch("ALL"),
  department: z.string().trim().max(64).catch(""),
  year: z.coerce.number().int().min(1).max(10).optional().catch(undefined),
});

export type RegistrationFilters = z.infer<typeof filterSchema>;

export function parseRegistrationFilters(params: Record<string, unknown>): RegistrationFilters {
  return filterSchema.parse({ ...params, year: params.year || undefined });
}

/** The filters as an address query, leaving out anything at its default. */
export function filterQuery(filters: RegistrationFilters) {
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.status !== "ACTIVE") query.set("status", filters.status);
  if (filters.attendance !== "ALL") query.set("attendance", filters.attendance);
  if (filters.department) query.set("department", filters.department);
  if (filters.year) query.set("year", String(filters.year));
  return query;
}

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  CONFIRMED: "Registered",
  WAITLISTED: "Waitlist",
  CANCELLED: "Cancelled",
};

export type RegistrationRow = {
  id: string;
  name: string;
  rollNo: string | null;
  email: string;
  phone: string | null;
  department: string | null;
  year: number | null;
  team: string | null;
  status: RegistrationStatus;
  /** Where they stand in the queue: 1 is next. */
  waitlistPlace: number | null;
  registeredAt: Date;
  checkedInAt: Date | null;
  checkedInBy: string | null;
};

// ─── Exports ────────────────────────────────────────────────────────────────

type Cell = string | number | null;

/** Header row plus one row per person. No ticket codes: anyone holding one could get in. */
export function exportTable(rows: RegistrationRow[]): Cell[][] {
  return [
    [
      "Name",
      "Roll no",
      "Email",
      "Phone",
      "Department",
      "Year",
      "Team",
      "Status",
      "Waitlist place",
      "Registered at",
      "Checked in at",
      "Checked in by",
    ],
    ...rows.map((r) => [
      r.name,
      r.rollNo,
      r.email,
      r.phone,
      r.department,
      r.year,
      r.team,
      REGISTRATION_STATUS_LABELS[r.status],
      r.waitlistPlace,
      formatDateTime(r.registeredAt),
      r.checkedInAt && formatDateTime(r.checkedInAt),
      r.checkedInBy,
    ]),
  ];
}

/**
 * Spreadsheets run a cell starting with = + - or @ as a formula, and names and team
 * names are typed by students. A leading quote keeps it as plain text. Phone numbers
 * like +91 98765 43210 can't do any harm, and are left as they are.
 */
function neutralizeFormula(value: string) {
  const looksLikeNumber = /^[+-]?[\d\s()-]+$/.test(value);
  return /^[=+\-@\t\r]/.test(value) && !looksLikeNumber ? `'${value}` : value;
}

function csvCell(cell: Cell) {
  if (cell === null) return "";
  if (typeof cell === "number") return String(cell);
  const safe = neutralizeFormula(cell);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The byte order mark tells Excel this is UTF-8, so names in Marathi or Hindi stay readable. */
export function toCsv(table: Cell[][]) {
  return `﻿${table.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
