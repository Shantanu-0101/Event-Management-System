import { Prisma } from "@/generated/prisma/client";
import type { EventStatus } from "@/generated/prisma/enums";
import type { EventInput, PublicEventFilters } from "@/lib/event-schema";
import {
  ACTION_TARGET,
  effectiveStatus,
  eligibilityRows,
  isEditable,
  publishProblem,
  seatsTaken,
  statusActions,
  type StatusAction,
} from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { eventChangedEmail } from "@/lib/registration-emails";
import { eventEditProblem } from "@/lib/registrations";
import { slugify } from "@/lib/schemas";
import {
  eventAudience,
  eventCancelledEmails,
  lockEvent,
  LOCKED_TRANSACTION,
  promoteWaitlist,
} from "@/server/services/registrations";
import type { CurrentUser } from "@/server/session";

export const EVENTS_PAGE_SIZE = 20;

/** An event rule was broken; the message is safe to show to the user. */
export class EventRuleError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

// The two counts seatsTaken() in lib/events.ts chooses between.
const confirmedSeats = {
  registrations: { where: { status: "CONFIRMED" } },
  teams: { where: { registrations: { some: { status: "CONFIRMED" } } } },
} satisfies Prisma.EventCountOutputTypeSelect;

// ─── Public pages ───────────────────────────────────────────────────────────

const LIVE: EventStatus[] = ["PUBLISHED", "REG_CLOSED", "ONGOING"];

export const eventCardSelect = {
  id: true,
  title: true,
  slug: true,
  subEvent: true,
  posterUrl: true,
  startsAt: true,
  endsAt: true,
  regOpensAt: true,
  regClosesAt: true,
  capacity: true,
  status: true,
  participation: true,
  seatPer: true,
  category: { select: { name: true, icon: true } },
  venue: { select: { name: true } },
  _count: { select: confirmedSeats },
} satisfies Prisma.EventSelect;

export function publicEventsWhere(f: PublicEventFilters, now: Date): Prisma.EventWhereInput {
  const and: Prisma.EventWhereInput[] = [];

  // Upcoming: live and not over yet. Past: everything else the public may see.
  // Dates decide, not only the saved status, because the job that saves status
  // changes may not have run yet.
  and.push(
    f.tab === "upcoming"
      ? { status: { in: LIVE }, endsAt: { gt: now } }
      : {
          OR: [
            { status: { in: ["COMPLETED", "CANCELLED"] } },
            { status: { in: LIVE }, endsAt: { lte: now } },
          ],
        },
  );

  if (f.q) {
    const contains = { contains: f.q, mode: "insensitive" as const };
    and.push({
      OR: [
        { title: contains },
        { subEvent: contains },
        { category: { name: contains } },
        { venue: { name: contains } },
      ],
    });
  }
  // A category hidden by an admin hides its events from the list.
  and.push({ category: f.category ? { slug: f.category, isActive: true } : { isActive: true } });

  if (f.department) {
    // Open to all, or a rule naming this department, or a rule on years only.
    and.push({
      OR: [
        { eligibility: { none: {} } },
        { eligibility: { some: { departmentId: f.department } } },
        { eligibility: { some: { departmentId: null } } },
      ],
    });
  }
  // Any overlap with the chosen days counts.
  if (f.fromDate) and.push({ endsAt: { gte: f.fromDate } });
  if (f.toDate) and.push({ startsAt: { lte: f.toDate } });

  return { AND: and };
}

export async function listPublicEvents(f: PublicEventFilters, now: Date) {
  const where = publicEventsWhere(f, now);
  const total = await prisma.event.count({ where });
  const pages = Math.max(1, Math.ceil(total / EVENTS_PAGE_SIZE));
  const events = await prisma.event.findMany({
    where,
    select: eventCardSelect,
    orderBy: [{ startsAt: f.sort }, { id: "asc" }],
    skip: (Math.min(f.page, pages) - 1) * EVENTS_PAGE_SIZE,
    take: EVENTS_PAGE_SIZE,
  });
  return { events, total, pages, page: Math.min(f.page, pages) };
}

export async function getEventFilterOptions() {
  const [categories, departments] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { slug: true, name: true },
    }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);
  return { categories, departments };
}

/** Everything the event page shows. Callers decide who may see a draft. */
export async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({
    where: { slug },
    include: {
      category: { select: { name: true, slug: true, icon: true } },
      venue: { select: { name: true, building: true } },
      eligibility: { include: { department: { select: { code: true } } } },
      coordinators: {
        select: {
          userId: true,
          user: { select: { name: true, email: true, phone: true } },
        },
        orderBy: { user: { name: "asc" } },
      },
      _count: { select: confirmedSeats },
    },
  });
}

/** Admins manage every event; coordinators only those they're assigned to. */
export function canManageEvent(
  user: Pick<CurrentUser, "id" | "role">,
  event: { coordinators: { userId: string }[] },
) {
  if (user.role === "ADMIN") return true;
  return user.role === "COORDINATOR" && event.coordinators.some((c) => c.userId === user.id);
}

// ─── Manage pages ───────────────────────────────────────────────────────────

/** Finds events by the status people see (effectiveStatus), not the saved one. */
function effectiveStatusWhere(status: EventStatus, now: Date): Prisma.EventWhereInput {
  const notOver = { endsAt: { gt: now } };
  switch (status) {
    case "COMPLETED":
      return {
        OR: [{ status: "COMPLETED" }, { status: { in: LIVE }, endsAt: { lte: now } }],
      };
    case "ONGOING":
      return {
        ...notOver,
        OR: [{ status: "ONGOING" }, { status: { in: LIVE }, startsAt: { lte: now } }],
      };
    case "REG_CLOSED":
      return {
        startsAt: { gt: now },
        ...notOver,
        OR: [{ status: "REG_CLOSED" }, { status: "PUBLISHED", regClosesAt: { lte: now } }],
      };
    case "PUBLISHED":
      return { status: "PUBLISHED", regClosesAt: { gt: now }, startsAt: { gt: now }, ...notOver };
    default:
      return { status };
  }
}

export async function listManagedEvents(
  user: Pick<CurrentUser, "id" | "role">,
  opts: { q: string; status?: EventStatus; page: number },
  now: Date,
) {
  const where: Prisma.EventWhereInput = {
    AND: [
      user.role === "ADMIN" ? {} : { coordinators: { some: { userId: user.id } } },
      opts.status ? effectiveStatusWhere(opts.status, now) : {},
      opts.q ? { title: { contains: opts.q, mode: "insensitive" } } : {},
    ],
  };
  const total = await prisma.event.count({ where });
  const pages = Math.max(1, Math.ceil(total / EVENTS_PAGE_SIZE));
  const page = Math.min(opts.page, pages);
  const events = await prisma.event.findMany({
    where,
    select: eventCardSelect,
    orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    skip: (page - 1) * EVENTS_PAGE_SIZE,
    take: EVENTS_PAGE_SIZE,
  });
  return { events, total, pages, page };
}

export async function getEventForEdit(id: string) {
  return prisma.event.findUnique({
    where: { id },
    include: {
      eligibility: { select: { departmentId: true, year: true } },
      coordinators: { select: { userId: true } },
    },
  });
}

/** The lists the event form picks from. A hidden category stays pickable on an event using it. */
export async function getEventFormOptions(currentCategoryId?: string) {
  const [categories, venues, departments, coordinators] = await Promise.all([
    prisma.category.findMany({
      where: {
        OR: [{ isActive: true }, ...(currentCategoryId ? [{ id: currentCategoryId }] : [])],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.venue.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, capacity: true },
    }),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.user.findMany({
      where: { role: "COORDINATOR", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
  ]);
  return { categories, venues, departments, coordinators };
}

// ─── Saving ─────────────────────────────────────────────────────────────────

async function uniqueSlug(title: string) {
  const base = slugify(title).slice(0, 60).replace(/-+$/, "") || "event";
  const taken = await prisma.event.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const used = new Set(taken.map((e) => e.slug));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Two saves in the same moment can pick one slug; the second tries again. */
async function withFreshSlug<T>(title: string, create: (slug: string) => Promise<T>): Promise<T> {
  try {
    return await create(await uniqueSlug(title));
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return create(await uniqueSlug(title));
    }
    throw e;
  }
}

/** The form can post any ids; check they exist before the database complains. */
async function assertReferencesExist(data: EventInput, includeCoordinators: boolean) {
  const [category, venue, departments, coordinators] = await Promise.all([
    prisma.category.count({ where: { id: data.categoryId } }),
    data.venueId ? prisma.venue.count({ where: { id: data.venueId } }) : 1,
    prisma.department.count({ where: { id: { in: data.departmentIds } } }),
    includeCoordinators
      ? prisma.user.count({
          where: { id: { in: data.coordinatorIds }, role: "COORDINATOR", isActive: true },
        })
      : data.coordinatorIds.length,
  ]);
  if (!category) throw new EventRuleError("Choose a category.", "categoryId");
  if (!venue) throw new EventRuleError("Choose a venue from the list.", "venueId");
  if (departments !== new Set(data.departmentIds).size) {
    throw new EventRuleError("A chosen department no longer exists. Reload the page.");
  }
  if (coordinators !== new Set(data.coordinatorIds).size) {
    throw new EventRuleError("A chosen coordinator is no longer available. Reload the page.");
  }
}

/** The columns the form edits; also what a duplicate copies. */
function eventFields(data: Omit<EventInput, "departmentIds" | "years" | "coordinatorIds">) {
  return {
    title: data.title,
    categoryId: data.categoryId,
    subEvent: data.subEvent,
    description: data.description,
    posterUrl: data.posterUrl,
    rulesUrl: data.rulesUrl,
    venueId: data.venueId,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    regOpensAt: data.regOpensAt,
    regClosesAt: data.regClosesAt,
    capacity: data.capacity,
    participation: data.participation,
    teamMin: data.teamMin,
    teamMax: data.teamMax,
    seatPer: data.seatPer,
  };
}

const unique = <T>(items: T[]) => [...new Set(items)];

/** New events always start as drafts. */
export async function createEvent(actor: Pick<CurrentUser, "id">, data: EventInput) {
  await assertReferencesExist(data, true);

  return withFreshSlug(data.title, (slug) =>
    prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          ...eventFields(data),
          slug,
          createdById: actor.id,
          eligibility: {
            create: eligibilityRows(unique(data.departmentIds), unique(data.years)),
          },
          coordinators: {
            create: unique(data.coordinatorIds).map((userId) => ({ userId })),
          },
        },
      });
      await tx.auditLog.create({
        data: { actorId: actor.id, action: "event.created", entity: "event", entityId: event.id },
      });
      return event;
    }),
  );
}

/**
 * Saves changes. The web address stays the same, so shared links keep working.
 * Assigning coordinators is the admin's job, so a coordinator's save leaves them.
 * Returns the emails to send when more seats moved people off the waitlist, or
 * when the time or place changed: someone could turn up at the wrong one otherwise.
 */
export async function updateEvent(
  actor: Pick<CurrentUser, "id" | "role">,
  id: string,
  data: EventInput,
  now: Date,
) {
  const event = await getEventForEdit(id);
  if (!event) throw new EventRuleError("This event no longer exists.");
  if (!canManageEvent(actor, event)) throw new EventRuleError("You don't manage this event.");
  if (!isEditable(event, now)) {
    throw new EventRuleError("Completed and cancelled events can't be changed.");
  }

  const isAdmin = actor.role === "ADMIN";
  await assertReferencesExist(data, isAdmin);

  return prisma.$transaction(async (tx) => {
    // Held while checking, so nobody can take a seat between the check and the save.
    const locked = await lockEvent(tx, id);
    if (!locked) throw new EventRuleError("This event no longer exists.");

    const [registrations, teams, confirmedTeams] = await Promise.all([
      tx.registration.groupBy({
        by: ["status"],
        where: { eventId: id, status: { in: ["CONFIRMED", "WAITLISTED"] } },
        _count: { _all: true },
      }),
      tx.team.count({ where: { eventId: id } }),
      tx.team.count({
        where: { eventId: id, registrations: { some: { status: "CONFIRMED" } } },
      }),
    ]);
    const confirmed = registrations.find((r) => r.status === "CONFIRMED")?._count._all ?? 0;
    const problem = eventEditProblem(locked, data, {
      registrations: registrations.reduce((sum, r) => sum + r._count._all, 0),
      teams,
      seatsTaken: seatsTaken({
        ...locked,
        _count: { registrations: confirmed, teams: confirmedTeams },
      }),
    });
    if (problem) throw new EventRuleError(problem.message, problem.field);

    const startMoved = data.startsAt.getTime() !== locked.startsAt.getTime();
    const timeChanged = startMoved || data.endsAt.getTime() !== locked.endsAt.getTime();
    const venueChanged = data.venueId !== locked.venueId;

    const saved = await tx.event.update({
      where: { id },
      // A reminder about the old time doesn't count for the new one.
      data: { ...eventFields(data), ...(startMoved ? { reminderSentAt: null } : {}) },
      include: { venue: { select: { name: true, building: true } } },
    });

    await tx.eventEligibility.deleteMany({ where: { eventId: id } });
    await tx.eventEligibility.createMany({
      data: eligibilityRows(unique(data.departmentIds), unique(data.years)).map((row) => ({
        ...row,
        eventId: id,
      })),
    });

    if (isAdmin) {
      await tx.eventCoordinator.deleteMany({ where: { eventId: id } });
      await tx.eventCoordinator.createMany({
        data: unique(data.coordinatorIds).map((userId) => ({ userId, eventId: id })),
      });
    }

    await tx.auditLog.create({
      data: { actorId: actor.id, action: "event.updated", entity: "event", entityId: id },
    });

    const changed = [timeChanged && "time", venueChanged && "venue"].filter(Boolean).join(" and ");
    const changeEmails = changed
      ? (await eventAudience(tx, id)).map((person) => eventChangedEmail(person, saved, changed))
      : [];

    // A raised or removed limit makes room for the waitlist.
    const promoted = await promoteWaitlist(tx, { ...locked, ...saved });
    return [...changeEmails, ...promoted];
  }, LOCKED_TRANSACTION);
}

/** A new draft with the same details, for next year's edition. Dates are kept for editing. */
export async function duplicateEvent(actor: Pick<CurrentUser, "id">, id: string) {
  const source = await prisma.event.findUnique({
    where: { id },
    include: { eligibility: true, coordinators: true },
  });
  if (!source) throw new EventRuleError("This event no longer exists.");

  const title = `Copy of ${source.title}`.slice(0, 120);
  return withFreshSlug(title, (slug) =>
    prisma.$transaction(async (tx) => {
      const copy = await tx.event.create({
        data: {
          ...eventFields({ ...source, title }),
          certificateTemplateUrl: source.certificateTemplateUrl,
          slug,
          createdById: actor.id,
          eligibility: {
            create: source.eligibility.map((r) => ({
              departmentId: r.departmentId,
              year: r.year,
            })),
          },
          coordinators: {
            create: source.coordinators.map((c) => ({ userId: c.userId })),
          },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "event.duplicated",
          entity: "event",
          entityId: copy.id,
          meta: { from: id },
        },
      });
      return copy;
    }),
  );
}

/**
 * Publish, close, reopen or cancel. The update only applies if the saved status
 * is still the one the rules were checked against, so two people clicking at
 * once can't both succeed. Cancelling returns the emails telling people about it.
 */
export async function changeEventStatus(
  actor: Pick<CurrentUser, "id" | "role">,
  id: string,
  action: StatusAction,
  now: Date,
) {
  const event = await getEventForEdit(id);
  if (!event) throw new EventRuleError("This event no longer exists.");
  if (!canManageEvent(actor, event)) throw new EventRuleError("You don't manage this event.");

  if (!statusActions(event, actor.role, now).includes(action)) {
    const problem = action === "publish" && event.status === "DRAFT" && publishProblem(event, now);
    throw new EventRuleError(problem || "This event can't make that change right now.");
  }

  const to = ACTION_TARGET[action];
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.event.updateMany({
      where: { id, status: event.status },
      data: { status: to },
    });
    if (count === 0) throw new EventRuleError("Someone else just changed this event. Try again.");

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "event.status_changed",
        entity: "event",
        entityId: id,
        meta: { from: effectiveStatus(event, now), to },
      },
    });

    return to === "CANCELLED" ? eventCancelledEmails(tx, event) : [];
  });
}

/**
 * Saves the moves the dates have already made (see effectiveStatus). Run by the
 * scheduled job. Later moves go first, so an event several steps behind goes
 * straight to where it belongs. Safe to run any number of times.
 */
export async function advanceEventStatuses(now: Date) {
  const [completed, ongoing, closed] = await prisma.$transaction([
    prisma.event.updateMany({
      where: { status: { in: LIVE }, endsAt: { lte: now } },
      data: { status: "COMPLETED" },
    }),
    prisma.event.updateMany({
      where: { status: { in: ["PUBLISHED", "REG_CLOSED"] }, startsAt: { lte: now } },
      data: { status: "ONGOING" },
    }),
    prisma.event.updateMany({
      where: { status: "PUBLISHED", regClosesAt: { lte: now } },
      data: { status: "REG_CLOSED" },
    }),
  ]);
  return { completed: completed.count, ongoing: ongoing.count, closed: closed.count };
}
