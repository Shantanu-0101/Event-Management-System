import { isCronAuthorized } from "@/server/cron";
import { advanceEventStatuses } from "@/server/services/events";
import { deleteExpiredRateLimits } from "@/server/services/rate-limit";

/** Saves status moves the dates have made and tidies old counters. Scheduled in vercel.json. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  const now = new Date();
  const [statuses, rateLimitsRemoved] = await Promise.all([
    advanceEventStatuses(now),
    deleteExpiredRateLimits(now),
  ]);
  return Response.json({ ...statuses, rateLimitsRemoved });
}
