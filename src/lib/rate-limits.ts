import { createHash } from "node:crypto";

// How often public or costly actions may run. A whole campus often shares one
// internet address, so limits per address are high enough for a registration-day
// rush. The tight limits count one account or person.

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export const RATE_LIMITS = {
  // Per email and address, and cleared by a successful login.
  loginAccount: { max: 10, windowSeconds: 15 * MINUTE },
  loginAddress: { max: 300, windowSeconds: 15 * MINUTE },
  signupAddress: { max: 60, windowSeconds: HOUR },
  // Per email, so one mailbox can't be flooded with reset links.
  forgotEmail: { max: 3, windowSeconds: HOUR },
  forgotAddress: { max: 60, windowSeconds: HOUR },
  resetAddress: { max: 30, windowSeconds: HOUR },
  verifyEmailUser: { max: 5, windowSeconds: HOUR },
  // Uploads use up the free Cloudinary quota; invites send other people email.
  uploadUser: { max: 30, windowSeconds: HOUR },
  inviteUser: { max: 30, windowSeconds: HOUR },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/** A hash, so the rate_limits table holds no emails or addresses. */
export function rateLimitKey(name: RateLimitName, identifier: string) {
  return createHash("sha256").update(`${name}:${identifier.toLowerCase()}`).digest("hex");
}

/**
 * The visitor's internet address. Vercel sets x-forwarded-for itself and replaces
 * anything the visitor sent. Behind another host, make sure its proxy does the same.
 */
export function clientAddress(headers: Headers) {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/** "Try again in 12 minutes." Rounded up, so waiting that long always works. */
export function tryAgainMessage(retryAfterSeconds: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / MINUTE));
  return `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
