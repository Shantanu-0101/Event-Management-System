import { prisma } from "@/lib/prisma";

// Statuses in which an event is visible to the public and not yet over.
const LIVE_STATUSES = ["PUBLISHED", "REG_CLOSED", "ONGOING"] as const;

export type CategorySummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  upcomingEvents: number;
};

/** Active categories in display order, with how many upcoming events each has. */
export async function getActiveCategories(now: Date): Promise<CategorySummary[]> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      _count: {
        select: {
          events: { where: { status: { in: [...LIVE_STATUSES] }, endsAt: { gte: now } } },
        },
      },
    },
  });

  return categories.map(({ _count, ...c }) => ({ ...c, upcomingEvents: _count.events }));
}
