import jsQR from "jsqr";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import {
  checkInProblem,
  formatTicketCode,
  looksLikeTicketCode,
  normalizeTicketCode,
  percent,
} from "@/lib/check-in";
import type { Schedule } from "@/lib/events";
import { newTicketCode, verifyTicketCode } from "@/lib/tickets";

const SECRET = "unit-tests-only";

describe("ticket codes", () => {
  it("are 16 characters from the unambiguous alphabet, and all different", () => {
    const codes = Array.from({ length: 200 }, () => newTicketCode(SECRET));
    for (const code of codes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("verify when genuine", () => {
    const code = newTicketCode(SECRET);
    expect(verifyTicketCode(code, SECRET)).toBe(code);
  });

  it("verify however they were typed", () => {
    const code = newTicketCode(SECRET);
    const typed = formatTicketCode(code).toLowerCase().replace(/0/g, "o").replace(/1/g, "l");
    expect(verifyTicketCode(` ${typed} `, SECRET)).toBe(code);
  });

  it("are refused when any character changes", () => {
    const code = newTicketCode(SECRET);
    for (let i = 0; i < code.length; i++) {
      const swapped = code[i] === "A" ? "B" : "A";
      expect(verifyTicketCode(code.slice(0, i) + swapped + code.slice(i + 1), SECRET)).toBeNull();
    }
  });

  it("are refused when signed with another secret", () => {
    expect(verifyTicketCode(newTicketCode("another-secret"), SECRET)).toBeNull();
  });

  it("are refused when the wrong length or empty", () => {
    const code = newTicketCode(SECRET);
    expect(verifyTicketCode(code.slice(0, -1), SECRET)).toBeNull();
    expect(verifyTicketCode(`${code}0`, SECRET)).toBeNull();
    expect(verifyTicketCode("", SECRET)).toBeNull();
  });

  it("are told apart from names and roll numbers in the search box", () => {
    expect(looksLikeTicketCode(formatTicketCode(newTicketCode(SECRET)))).toBe(true);
    expect(looksLikeTicketCode("Priya Sharma")).toBe(false);
    expect(looksLikeTicketCode("CS21B1042")).toBe(false);
  });

  it("are told apart from a name that happens to have 16 usable letters", () => {
    expect(looksLikeTicketCode("Onboarding Tester")).toBe(false);
    expect(looksLikeTicketCode("Nikhil-Deshpande")).toBe(false);
  });

  it("are recognised however they're typed", () => {
    const code = formatTicketCode(newTicketCode(SECRET));
    expect(looksLikeTicketCode(code.toLowerCase())).toBe(true);
    expect(looksLikeTicketCode(code.replaceAll("-", ""))).toBe(true);
    expect(looksLikeTicketCode(code.replaceAll("-", " "))).toBe(true);
    expect(looksLikeTicketCode(`  ${code} `)).toBe(true);
  });

  it("group into fours for reading", () => {
    expect(formatTicketCode("ABCDEFGHJKMNPQRS")).toBe("ABCD-EFGH-JKMN-PQRS");
    expect(normalizeTicketCode("abcd-efgh-jkmn-pqrs")).toBe("ABCDEFGHJKMNPQRS");
  });

  it("survive being drawn as the ticket's QR and read back by the scanner's decoder", () => {
    const code = newTicketCode(SECRET);
    const { modules } = QRCode.create(code, { errorCorrectionLevel: "M" });

    // Draw it the way a phone screen would show it: black squares, white border.
    const scale = 6;
    const border = 4;
    const side = (modules.size + border * 2) * scale;
    const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (!modules.get(y, x)) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const at = ((y + border) * scale + dy) * side + (x + border) * scale + dx;
            pixels.fill(0, at * 4, at * 4 + 3);
          }
        }
      }
    }

    expect(jsQR(pixels, side, side)?.data).toBe(code);
  });
});

describe("checkInProblem", () => {
  const event: Schedule = {
    status: "PUBLISHED",
    regOpensAt: new Date("2026-11-01T00:00:00Z"),
    regClosesAt: new Date("2026-11-09T00:00:00Z"),
    startsAt: new Date("2026-11-10T04:30:00Z"),
    endsAt: new Date("2026-11-10T12:30:00Z"),
  };

  it("is closed until a day before the start, and says when it opens", () => {
    expect(checkInProblem(event, new Date("2026-11-09T04:29:00Z"))).toMatch(/opens.*9 Nov,? 2026/i);
  });

  it("opens a day before the start", () => {
    expect(checkInProblem(event, new Date("2026-11-09T04:30:00Z"))).toBeNull();
  });

  it("stays open during the event and for a day after it ends", () => {
    expect(checkInProblem(event, new Date("2026-11-10T06:00:00Z"))).toBeNull();
    expect(checkInProblem(event, new Date("2026-11-11T12:30:00Z"))).toBeNull();
  });

  it("closes a day after the end", () => {
    expect(checkInProblem(event, new Date("2026-11-11T12:31:00Z"))).toMatch(/closed/i);
  });

  it("never opens for drafts or cancelled events", () => {
    const during = new Date("2026-11-10T06:00:00Z");
    expect(checkInProblem({ ...event, status: "DRAFT" }, during)).toMatch(/published/i);
    expect(checkInProblem({ ...event, status: "CANCELLED" }, during)).toMatch(/cancelled/i);
  });
});

describe("percent", () => {
  it("rounds to a whole number", () => {
    expect(percent(2, 3)).toBe(67);
    expect(percent(40, 40)).toBe(100);
    expect(percent(0, 40)).toBe(0);
  });

  it("has no answer when there's nothing to divide by", () => {
    expect(percent(0, 0)).toBeNull();
  });
});
