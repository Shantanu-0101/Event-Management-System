import { sendEmails, type Email } from "@/lib/email";
import { prisma } from "@/lib/prisma";

/** How many the bell's list shows. Older ones stay in the database. */
export const NOTIFICATION_LIST_SIZE = 20;

/**
 * Tells people about something that already happened: a notification on their bell
 * for each email marked for it, then the emails. Never throws, because the change
 * that caused all this is already saved. The bell goes first, so it still works
 * when email doesn't.
 */
export async function deliver(emails: Email[]): Promise<void> {
  if (emails.length === 0) return;
  try {
    await prisma.notification.createMany({
      data: emails.flatMap(({ notify, subject, content }) =>
        notify
          ? [
              {
                userId: notify.userId,
                title: subject,
                body: content.paragraphs[0] ?? "",
                link: notify.link,
              },
            ]
          : [],
      ),
    });
  } catch (e) {
    console.error("Could not save notifications:", e);
  }
  await sendEmails(emails);
}

export function countUnread(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function listNotifications(userId: string) {
  const [unread, items] = await Promise.all([
    countUnread(userId),
    prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: NOTIFICATION_LIST_SIZE,
      select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
    }),
  ]);
  return { unread, items };
}

/** Marks one of this person's notifications as read, or all of them. Someone else's stays as is. */
export async function markNotificationsRead(userId: string, id: string | null, now: Date) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null, ...(id ? { id } : {}) },
    data: { readAt: now },
  });
  return countUnread(userId);
}
