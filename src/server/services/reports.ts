import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// College-wide numbers for the admin dashboard. Everything counts confirmed
// people on events that are really running: a draft is not activity, and a
// cancelled event's registrations say nothing about what people turned up to.

type GroupCount = { label: string; registered: number };
type EventCount = { id: string; title: string; registered: number; checkedIn: number };

export async function getCollegeReport(now: Date) {
  const running: Prisma.EventWhereInput = { status: { notIn: ["DRAFT", "CANCELLED"] } };

  const [events, upcoming, students, registrations, byCategory, byDepartment, topEvents, finished] =
    await Promise.all([
      prisma.event.count({ where: running }),
      prisma.event.count({ where: { ...running, endsAt: { gt: now } } }),
      prisma.user.count({ where: { role: "STUDENT", isActive: true } }),
      prisma.registration.count({ where: { status: "CONFIRMED", event: running } }),
      prisma.$queryRaw<GroupCount[]>`
        SELECT c.name AS label, COUNT(r.id)::int AS registered
        FROM registrations r
        JOIN events e ON e.id = r.event_id
        JOIN categories c ON c.id = e.category_id
        WHERE r.status = 'CONFIRMED' AND e.status NOT IN ('DRAFT', 'CANCELLED')
        GROUP BY c.id, c.name
        ORDER BY registered DESC, label ASC
      `,
      prisma.$queryRaw<GroupCount[]>`
        SELECT COALESCE(d.name, 'No department') AS label, COUNT(r.id)::int AS registered
        FROM registrations r
        JOIN events e ON e.id = r.event_id
        JOIN users u ON u.id = r.user_id
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE r.status = 'CONFIRMED' AND e.status NOT IN ('DRAFT', 'CANCELLED')
        GROUP BY d.id, d.name
        ORDER BY registered DESC, label ASC
      `,
      prisma.$queryRaw<EventCount[]>`
        SELECT e.id, e.title, COUNT(r.id)::int AS registered,
               COUNT(r.checked_in_at)::int AS "checkedIn"
        FROM events e
        JOIN registrations r ON r.event_id = e.id AND r.status = 'CONFIRMED'
        WHERE e.status NOT IN ('DRAFT', 'CANCELLED')
        GROUP BY e.id, e.title
        ORDER BY registered DESC, e.title ASC
        LIMIT 5
      `,
      // An event where nobody was scanned didn't take attendance. Counting it would
      // read as everyone staying away, so the rate only covers events that did.
      prisma.$queryRaw<EventCount[]>`
        SELECT e.id, e.title, COUNT(r.id)::int AS registered,
               COUNT(r.checked_in_at)::int AS "checkedIn"
        FROM events e
        JOIN registrations r ON r.event_id = e.id AND r.status = 'CONFIRMED'
        WHERE e.status NOT IN ('DRAFT', 'CANCELLED') AND e.ends_at <= ${now}
        GROUP BY e.id, e.title, e.ends_at
        HAVING COUNT(r.checked_in_at) > 0
        ORDER BY e.ends_at DESC
      `,
    ]);

  return {
    events,
    upcoming,
    students,
    registrations,
    byCategory,
    byDepartment,
    topEvents,
    attendance: {
      registered: finished.reduce((sum, e) => sum + e.registered, 0),
      checkedIn: finished.reduce((sum, e) => sum + e.checkedIn, 0),
      eventCount: finished.length,
      recent: finished.slice(0, 8),
    },
  };
}
