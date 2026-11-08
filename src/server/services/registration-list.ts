import { Prisma } from "@/generated/prisma/client";
import type { RegistrationFilters, RegistrationRow } from "@/lib/registration-list";
import { prisma } from "@/lib/prisma";

export const REGISTRATIONS_PAGE_SIZE = 50;

function registrationWhere(eventId: string, f: RegistrationFilters): Prisma.RegistrationWhereInput {
  const contains = { contains: f.q, mode: "insensitive" as const };
  return {
    eventId,
    status: f.status === "ACTIVE" ? { in: ["CONFIRMED", "WAITLISTED"] } : f.status,
    ...(f.attendance === "CHECKED_IN" && { checkedInAt: { not: null } }),
    ...(f.attendance === "NOT_CHECKED_IN" && { checkedInAt: null }),
    ...(f.q && {
      OR: [
        { user: { name: contains } },
        { user: { rollNo: contains } },
        { user: { email: contains } },
        { team: { name: contains } },
      ],
    }),
    user: {
      ...(f.department && { departmentId: f.department }),
      ...(f.year && { year: f.year }),
    },
  };
}

const rowSelect = {
  id: true,
  status: true,
  waitlistPosition: true,
  createdAt: true,
  checkedInAt: true,
  team: { select: { name: true } },
  checkedInBy: { select: { name: true } },
  user: {
    select: {
      name: true,
      rollNo: true,
      email: true,
      phone: true,
      year: true,
      department: { select: { code: true } },
    },
  },
} satisfies Prisma.RegistrationSelect;

// Registered first, then the waitlist in queue order. Enums sort as they're declared.
const rowOrder: Prisma.RegistrationOrderByWithRelationInput[] = [
  { status: "asc" },
  { waitlistPosition: "asc" },
  { team: { name: "asc" } },
  { user: { name: "asc" } },
];

/** Queue position to place in line. A team counts as one place; gaps don't count. */
async function waitlistPlaces(eventId: string) {
  const waiting = await prisma.registration.findMany({
    where: { eventId, status: "WAITLISTED" },
    distinct: ["waitlistPosition"],
    orderBy: { waitlistPosition: "asc" },
    select: { waitlistPosition: true },
  });
  return new Map(waiting.map((r, i) => [r.waitlistPosition, i + 1]));
}

type Row = Prisma.RegistrationGetPayload<{ select: typeof rowSelect }>;

function toRow(r: Row, places: Map<number | null, number>): RegistrationRow {
  return {
    id: r.id,
    name: r.user.name,
    rollNo: r.user.rollNo,
    email: r.user.email,
    phone: r.user.phone,
    department: r.user.department?.code ?? null,
    year: r.user.year,
    team: r.team?.name ?? null,
    status: r.status,
    waitlistPlace: r.status === "WAITLISTED" ? (places.get(r.waitlistPosition) ?? null) : null,
    registeredAt: r.createdAt,
    checkedInAt: r.checkedInAt,
    checkedInBy: r.checkedInBy?.name ?? null,
  };
}

/** One page of an event's registrations. Callers check who may see them. */
export async function listRegistrations(
  eventId: string,
  filters: RegistrationFilters,
  requestedPage: number,
) {
  const where = registrationWhere(eventId, filters);
  const total = await prisma.registration.count({ where });
  const pages = Math.max(1, Math.ceil(total / REGISTRATIONS_PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pages);

  const [rows, places] = await Promise.all([
    prisma.registration.findMany({
      where,
      select: rowSelect,
      orderBy: rowOrder,
      skip: (page - 1) * REGISTRATIONS_PAGE_SIZE,
      take: REGISTRATIONS_PAGE_SIZE,
    }),
    waitlistPlaces(eventId),
  ]);
  return { rows: rows.map((r) => toRow(r, places)), total, pages, page };
}

/**
 * Everything matching the filters, for a CSV or Excel file. Personal data is
 * leaving the system, so each export is written to the audit log (spec section 9).
 */
export async function exportRegistrations(
  actorId: string,
  eventId: string,
  filters: RegistrationFilters,
  format: "csv" | "xlsx",
) {
  const [rows, places] = await Promise.all([
    prisma.registration.findMany({
      where: registrationWhere(eventId, filters),
      select: rowSelect,
      orderBy: rowOrder,
    }),
    waitlistPlaces(eventId),
  ]);
  await prisma.auditLog.create({
    data: {
      actorId,
      action: "registrations.exported",
      entity: "event",
      entityId: eventId,
      meta: { format, rows: rows.length, filters: { ...filters } },
    },
  });
  return rows.map((r) => toRow(r, places));
}

/** The numbers above the table. Always the whole event, whatever the filters. */
export async function getRegistrationSummary(eventId: string) {
  const [byStatus, checkedIn] = await Promise.all([
    prisma.registration.groupBy({
      by: ["status"],
      where: { eventId },
      _count: { _all: true },
    }),
    prisma.registration.count({
      where: { eventId, status: "CONFIRMED", checkedInAt: { not: null } },
    }),
  ]);
  const count = (status: string) => byStatus.find((row) => row.status === status)?._count._all ?? 0;
  return {
    registered: count("CONFIRMED"),
    waitlisted: count("WAITLISTED"),
    cancelled: count("CANCELLED"),
    checkedIn,
  };
}
