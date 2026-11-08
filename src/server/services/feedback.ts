import { Prisma } from "@/generated/prisma/client";
import { afterEventProblem } from "@/lib/certificates";
import { prisma } from "@/lib/prisma";
import { EventRuleError } from "@/server/services/events";

/** How many comments the coordinator's page lists, newest first. */
const COMMENT_LIMIT = 100;

/** Whether this person can leave feedback, has already, or neither applies. */
export async function getFeedbackState(eventId: string, userId: string) {
  const [registration, feedback] = await Promise.all([
    prisma.registration.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { status: true, checkedInAt: true },
    }),
    prisma.feedback.findUnique({
      where: { eventId_userId: { eventId, userId } },
      select: { rating: true, comment: true },
    }),
  ]);
  return {
    attended: registration?.status === "CONFIRMED" && registration.checkedInAt !== null,
    feedback,
  };
}

/** Saves an attendee's rating. Once only: the database's unique rule settles a double submit. */
export async function submitFeedback(
  userId: string,
  eventId: string,
  input: { rating: number; comment?: string },
  now: Date,
) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true, regOpensAt: true, regClosesAt: true, startsAt: true, endsAt: true },
  });
  if (!event) throw new EventRuleError("This event no longer exists.");
  const closed = afterEventProblem(event, now);
  if (closed) throw new EventRuleError(closed);

  const { attended } = await getFeedbackState(eventId, userId);
  if (!attended) throw new EventRuleError("Only people who attended can give feedback.");

  try {
    await prisma.feedback.create({
      data: { eventId, userId, rating: input.rating, comment: input.comment ?? null },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new EventRuleError("You've already given feedback for this event.");
    }
    throw e;
  }
}

/** For coordinators: the average and comments, without names, so people can be honest. */
export async function getFeedbackSummary(eventId: string) {
  const [stats, comments] = await Promise.all([
    prisma.feedback.aggregate({
      where: { eventId },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.feedback.findMany({
      where: { eventId, comment: { not: null } },
      orderBy: { createdAt: "desc" },
      take: COMMENT_LIMIT,
      select: { id: true, rating: true, comment: true },
    }),
  ]);
  return {
    average: stats._avg.rating,
    count: stats._count._all,
    comments,
    commentLimit: COMMENT_LIMIT,
  };
}
