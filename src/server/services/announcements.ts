import { z } from "zod";
import type { Email } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { announcementEmail } from "@/lib/registration-emails";
import { canManageEvent, EventRuleError } from "@/server/services/events";
import { eventAudience } from "@/server/services/registrations";
import type { CurrentUser } from "@/server/session";

const ACTION = "event.announced";

const metaSchema = z.object({ subject: z.string(), body: z.string(), recipients: z.number() });

/** How many people an announcement would reach right now. */
export async function countAudience(eventId: string) {
  return (await eventAudience(prisma, eventId)).length;
}

/** Sends a message from a coordinator to everyone on the event. The audit log is its history. */
export async function sendAnnouncement(
  actor: Pick<CurrentUser, "id" | "role">,
  eventId: string,
  input: { subject: string; body: string },
): Promise<{ recipients: number; emails: Email[] }> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      coordinators: { select: { userId: true } },
    },
  });
  if (!event) throw new EventRuleError("This event no longer exists.");
  if (!canManageEvent(actor, event)) throw new EventRuleError("You don't manage this event.");
  if (event.status === "DRAFT") throw new EventRuleError("This event isn't published yet.");

  const people = await eventAudience(prisma, eventId);
  if (people.length === 0) throw new EventRuleError("Nobody has registered for this event yet.");

  await prisma.auditLog.create({
    data: {
      actorId: actor.id,
      action: ACTION,
      entity: "event",
      entityId: eventId,
      meta: { ...input, recipients: people.length },
    },
  });
  return {
    recipients: people.length,
    emails: people.map((p) => announcementEmail(p, event, input.subject, input.body)),
  };
}

export async function listAnnouncements(eventId: string) {
  const rows = await prisma.auditLog.findMany({
    where: { entity: "event", entityId: eventId, action: ACTION },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, meta: true, actor: { select: { name: true } } },
  });
  return rows.flatMap((row) => {
    const meta = metaSchema.safeParse(row.meta);
    return meta.success
      ? [{ id: row.id, sentAt: row.createdAt, sentBy: row.actor?.name ?? null, ...meta.data }]
      : [];
  });
}
