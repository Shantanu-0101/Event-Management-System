import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Departments, categories and venues: the lists admins maintain and events
// point at. A row still used by events or users can't be deleted; categories
// can be hidden instead (isActive = false).

export class MasterDataError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

/** Turns a unique-constraint error into a message for the clashing field. */
export function uniqueClash(e: unknown, labels: Record<string, string>): MasterDataError | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return null;
  // With the pg adapter the column names sit deeper in meta; search all of it.
  const target = JSON.stringify(e.meta ?? {});
  const field = Object.keys(labels).find((f) => target.includes(f)) ?? Object.keys(labels)[0];
  return new MasterDataError(`Another row already uses this ${labels[field]}.`, field);
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

export async function listDepartments() {
  return prisma.department.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { users: true, eligibility: true } } },
  });
}

export async function deleteDepartment(id: string) {
  const d = await prisma.department.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { users: true, eligibility: true } } },
  });
  if (d._count.users + d._count.eligibility > 0) {
    throw new MasterDataError(
      `${d.name} has ${count(d._count.users, "user")} and ${count(d._count.eligibility, "event rule")}; move them first.`,
    );
  }
  await prisma.department.delete({ where: { id } });
}

export async function listCategories() {
  return prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { events: true } } },
  });
}

export async function deleteCategory(id: string) {
  const c = await prisma.category.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { events: true } } },
  });
  if (c._count.events > 0) {
    throw new MasterDataError(
      `${c.name} has ${count(c._count.events, "event")}. Untick "Shown on the site" to hide it instead.`,
    );
  }
  await prisma.category.delete({ where: { id } });
}

export async function listVenues() {
  return prisma.venue.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { events: true } } },
  });
}

export async function deleteVenue(id: string) {
  const v = await prisma.venue.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { events: true } } },
  });
  if (v._count.events > 0) {
    throw new MasterDataError(
      `${v.name} is used by ${count(v._count.events, "event")}; move them first.`,
    );
  }
  await prisma.venue.delete({ where: { id } });
}
