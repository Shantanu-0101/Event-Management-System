import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimitKey } from "@/lib/rate-limits";
import {
  clearRateLimit,
  deleteExpiredRateLimits,
  hitRateLimit,
} from "@/server/services/rate-limit";

describe("rate limits", () => {
  beforeEach(async () => {
    await prisma.rateLimit.deleteMany();
  });

  it("allows the limit and refuses the next attempt", async () => {
    const { max } = RATE_LIMITS.forgotEmail;
    for (let i = 0; i < max; i++) {
      expect(await hitRateLimit("forgotEmail", "a@test.local")).toEqual({ ok: true });
    }
    const refused = await hitRateLimit("forgotEmail", "a@test.local");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts parallel attempts exactly, so a burst can't slip through", async () => {
    const { max } = RATE_LIMITS.loginAccount;
    const results = await Promise.all(
      Array.from({ length: max + 15 }, () => hitRateLimit("loginAccount", "burst")),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(max);
  });

  it("keeps people and limits apart", async () => {
    for (let i = 0; i <= RATE_LIMITS.forgotEmail.max; i++) {
      await hitRateLimit("forgotEmail", "a@test.local");
    }
    expect((await hitRateLimit("forgotEmail", "b@test.local")).ok).toBe(true);
    expect((await hitRateLimit("verifyEmailUser", "a@test.local")).ok).toBe(true);
  });

  it("starts counting again once the window is over", async () => {
    for (let i = 0; i <= RATE_LIMITS.forgotEmail.max; i++) {
      await hitRateLimit("forgotEmail", "a@test.local");
    }
    await prisma.rateLimit.update({
      where: { key: rateLimitKey("forgotEmail", "a@test.local") },
      data: { resetAt: new Date(Date.now() - 1000) },
    });
    expect((await hitRateLimit("forgotEmail", "a@test.local")).ok).toBe(true);
    const row = await prisma.rateLimit.findUniqueOrThrow({
      where: { key: rateLimitKey("forgotEmail", "a@test.local") },
    });
    expect(row.count).toBe(1);
    expect(row.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("forgets attempts when asked, and the daily job removes finished counters", async () => {
    await hitRateLimit("loginAccount", "a");
    await clearRateLimit("loginAccount", "a");
    expect(await prisma.rateLimit.count()).toBe(0);

    await hitRateLimit("loginAccount", "b");
    expect(await deleteExpiredRateLimits(new Date())).toBe(0);
    expect(await deleteExpiredRateLimits(new Date(Date.now() + 86_400_000))).toBe(1);
  });

  it("stores no emails or addresses", async () => {
    await hitRateLimit("loginAccount", "asha@test.local|10.0.0.1");
    const [row] = await prisma.rateLimit.findMany();
    expect(row.key).toMatch(/^[a-f0-9]{64}$/);
  });
});
