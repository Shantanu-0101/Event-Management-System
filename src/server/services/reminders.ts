import { prisma } from "@/lib/prisma";
import { reminderEmail } from "@/lib/registration-emails";
import { deliver } from "@/server/services/notifications";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Vercel's free plan runs a job once a day, so a reminder can't go out exactly 24
 * hours before the start. The job picks up everything starting within the next 36
 * hours, which puts each reminder 12 to 36 hours before its event: around a day, and
 * never in the last few hours, unless the event was only published that late.
 */
export const REMINDER_WINDOW_MS = 36 * HOUR_MS;

/** Reminds everyone confirmed for events starting soon. Run by the scheduled job. */
export async function sendDueReminders(now: Date) {
  const events = await prisma.event.findMany({
    where: {
      status: { in: ["PUBLISHED", "REG_CLOSED"] },
      reminderSentAt: null,
      startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_WINDOW_MS) },
    },
    include: { venue: { select: { name: true, building: true } } },
  });

  let reminded = 0;
  for (const event of events) {
    // Claimed first, so two runs at once can't remind people twice.
    const { count } = await prisma.event.updateMany({
      where: { id: event.id, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    if (count === 0) continue;

    const registrations = await prisma.registration.findMany({
      where: { eventId: event.id, status: "CONFIRMED", user: { isActive: true } },
      select: { id: true, user: { select: { id: true, name: true, email: true } } },
    });
    await deliver(registrations.map((r) => reminderEmail(r.user, event, r.id)));
    reminded += registrations.length;
  }
  return { events: events.length, reminded };
}
