import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimitKey, type RateLimitName } from "@/lib/rate-limits";

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Counts one attempt and says whether it's within the limit. The counter lives in the
 * database because each Vercel instance has its own memory. One statement does the
 * read and the write, so parallel attempts can't slip past the limit.
 */
export async function hitRateLimit(
  name: RateLimitName,
  identifier: string,
): Promise<RateLimitResult> {
  const { max, windowSeconds } = RATE_LIMITS[name];
  const key = rateLimitKey(name, identifier);

  const [row] = await prisma.$queryRaw<{ count: number; retry_after: number }[]>`
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}::double precision))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.reset_at <= now() THEN 1 ELSE rate_limits.count + 1 END,
      reset_at = CASE
        WHEN rate_limits.reset_at <= now() THEN EXCLUDED.reset_at
        ELSE rate_limits.reset_at
      END
    RETURNING count, CEIL(EXTRACT(EPOCH FROM reset_at - now()))::int AS retry_after
  `;

  return row.count <= max ? { ok: true } : { ok: false, retryAfterSeconds: row.retry_after };
}

/** Forgets the attempts counted so far, e.g. after a successful login. */
export async function clearRateLimit(name: RateLimitName, identifier: string) {
  await prisma.rateLimit.deleteMany({ where: { key: rateLimitKey(name, identifier) } });
}

/** Removes finished counters; the daily job calls this so the table stays small. */
export async function deleteExpiredRateLimits(now: Date) {
  const { count } = await prisma.rateLimit.deleteMany({ where: { resetAt: { lte: now } } });
  return count;
}
