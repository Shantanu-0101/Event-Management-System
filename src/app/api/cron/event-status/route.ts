import { createHash, timingSafeEqual } from "node:crypto";
import { advanceEventStatuses } from "@/server/services/events";

const hash = (value: string) => createHash("sha256").update(value).digest();

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". */
function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  return timingSafeEqual(hash(given), hash(`Bearer ${secret}`));
}

/** Saves status moves the dates have made. Scheduled in vercel.json. */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  return Response.json(await advanceEventStatuses(new Date()));
}
