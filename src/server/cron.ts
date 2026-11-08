import { createHash, timingSafeEqual } from "node:crypto";

const hash = (value: string) => createHash("sha256").update(value).digest();

/** Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". */
export function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization") ?? "";
  return timingSafeEqual(hash(given), hash(`Bearer ${secret}`));
}
