import { describe, expect, it } from "vitest";
import { clientAddress, rateLimitKey, tryAgainMessage } from "@/lib/rate-limits";

describe("clientAddress", () => {
  it("takes the visitor from the front of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" });
    expect(clientAddress(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to one shared bucket", () => {
    expect(clientAddress(new Headers({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});

describe("rateLimitKey", () => {
  it("ignores case, so Asha@ and asha@ share a counter", () => {
    expect(rateLimitKey("forgotEmail", "Asha@x.in")).toBe(rateLimitKey("forgotEmail", "asha@x.in"));
  });

  it("differs between limits for the same person", () => {
    expect(rateLimitKey("forgotEmail", "a")).not.toBe(rateLimitKey("verifyEmailUser", "a"));
  });
});

describe("tryAgainMessage", () => {
  it("rounds up to whole minutes, so waiting that long always works", () => {
    expect(tryAgainMessage(61)).toBe("Too many attempts. Try again in 2 minutes.");
    expect(tryAgainMessage(1)).toBe("Too many attempts. Try again in 1 minute.");
  });
});
