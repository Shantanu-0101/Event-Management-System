import { describe, expect, it } from "vitest";
import { eventFormValues, eventSchema, parseEventFilters } from "@/lib/event-schema";
import { buildIcs } from "@/lib/ics";
import { cleanRichText, richTextToPlain } from "@/lib/rich-text";
import { isUploadedUrl } from "@/lib/storage";
import {
  endOfLocalDay,
  formatRange,
  parseLocalDateTime,
  startOfLocalDay,
  toLocalInput,
} from "@/lib/time";

const valid = {
  title: "Inter-college Hackathon",
  categoryId: "cat1",
  description: "<p>Build something in 24 hours.</p>",
  startsAt: "2026-12-10T09:00",
  endsAt: "2026-12-11T09:00",
  regOpensAt: "2026-11-20T09:00",
  regClosesAt: "2026-12-05T18:00",
  participation: "SOLO",
};

const errorsFor = (input: Record<string, unknown>) => {
  const result = eventSchema.safeParse({ ...valid, ...input });
  return result.success ? {} : result.error.flatten().fieldErrors;
};

describe("eventSchema", () => {
  it("accepts a complete event and fills in the empty fields", () => {
    const data = eventSchema.parse({ ...valid, capacity: "", venueId: "" });
    expect(data.capacity).toBeNull();
    expect(data.venueId).toBeNull();
    expect(data.departmentIds).toEqual([]);
    expect(data.startsAt.toISOString()).toBe("2026-12-10T03:30:00.000Z");
  });

  it("requires the main fields", () => {
    const errors = errorsFor({ title: "", categoryId: "", description: "<p></p>", startsAt: "" });
    expect(Object.keys(errors).sort()).toEqual(["categoryId", "description", "startsAt", "title"]);
  });

  it("checks the order of the dates", () => {
    expect(errorsFor({ endsAt: "2026-12-10T08:00" })).toHaveProperty("endsAt");
    expect(errorsFor({ regClosesAt: "2026-11-19T09:00" })).toHaveProperty("regClosesAt");
    expect(errorsFor({ regClosesAt: "2026-12-10T09:01" })).toHaveProperty("regClosesAt");
    // Closing exactly when the event starts is fine.
    expect(errorsFor({ regClosesAt: "2026-12-10T09:00" })).toEqual({});
  });

  it("refuses a capacity under 1", () => {
    expect(errorsFor({ capacity: "0" })).toHaveProperty("capacity");
    expect(errorsFor({ capacity: "2.5" })).toHaveProperty("capacity");
    expect(errorsFor({ capacity: "10" })).toEqual({});
  });

  it("requires sensible team sizes on team events only", () => {
    expect(errorsFor({ participation: "TEAM" })).toHaveProperty("teamMin");
    expect(errorsFor({ participation: "TEAM", teamMin: "4", teamMax: "2" })).toHaveProperty(
      "teamMax",
    );
    expect(errorsFor({ participation: "TEAM", teamMin: "2", teamMax: "4" })).toEqual({});
  });

  it("drops team settings from a solo event", () => {
    const data = eventSchema.parse({ ...valid, teamMin: "2", teamMax: "4", seatPer: "MEMBER" });
    expect(data).toMatchObject({ teamMin: null, teamMax: null, seatPer: "TEAM" });
  });

  it("removes scripts from the description", () => {
    const data = eventSchema.parse({
      ...valid,
      description: `<p onclick="steal()">Hello there, everyone</p><script>steal()</script>`,
    });
    expect(data.description).toBe("<p>Hello there, everyone</p>");
  });

  it("refuses a description that is empty once cleaned", () => {
    expect(errorsFor({ description: "<script>alert(1)</script>" })).toHaveProperty("description");
  });

  it("only accepts upload URLs this app handed out", () => {
    expect(errorsFor({ rulesUrl: "javascript:alert(1)" })).toHaveProperty("rulesUrl");
    expect(errorsFor({ posterUrl: "https://evil.test/x.png" })).toHaveProperty("posterUrl");
    expect(errorsFor({ posterUrl: "/uploads/event-posters/abc123.png" })).toEqual({});
  });

  it("reads ticked boxes as lists", () => {
    const form = new FormData();
    form.append("years", "3");
    form.append("years", "4");
    form.append("departmentIds", "cse");
    const values = eventFormValues(form);
    expect(values.years).toEqual(["3", "4"]);
    expect(values.departmentIds).toEqual(["cse"]);
    expect(values.coordinatorIds).toEqual([]);
  });
});

describe("isUploadedUrl", () => {
  it("knows this app's upload paths", () => {
    expect(isUploadedUrl("/uploads/event-rules/ab12.pdf")).toBe(true);
    expect(isUploadedUrl("https://res.cloudinary.com/demo/image/upload/v1/a.jpg")).toBe(true);
  });

  it("refuses everything else", () => {
    for (const url of [
      "javascript:alert(1)",
      "/uploads/../secret.png",
      "/uploads/x/ab.exe",
      "https://evil.test/res.cloudinary.com/a.jpg",
      "//res.cloudinary.com/a.jpg",
    ]) {
      expect(isUploadedUrl(url), url).toBe(false);
    }
  });
});

describe("rich text", () => {
  it("keeps formatting and makes links safe", () => {
    expect(cleanRichText(`<p><strong>Hi</strong> <a href="https://a.test">x</a></p>`)).toBe(
      `<p><strong>Hi</strong> <a href="https://a.test" target="_blank" rel="noopener noreferrer nofollow">x</a></p>`,
    );
  });

  it("removes script links", () => {
    expect(cleanRichText(`<a href="javascript:alert(1)">x</a>`)).not.toContain("javascript");
  });

  it("gives plain text with line breaks", () => {
    expect(richTextToPlain("<h2>Rules</h2><ul><li>A &amp; B</li><li>C</li></ul>")).toBe(
      "Rules\nA & B\nC",
    );
  });
});

describe("India time", () => {
  it("reads form values as India time whatever the server's timezone", () => {
    expect(parseLocalDateTime("2026-11-20T10:00")?.toISOString()).toBe("2026-11-20T04:30:00.000Z");
  });

  it("gives back the same value for the form", () => {
    expect(toLocalInput(new Date("2026-11-20T04:30:00.000Z"))).toBe("2026-11-20T10:00");
  });

  it("refuses values that aren't dates", () => {
    for (const bad of ["", "soon", "2026-13-45T10:00", "2026-11-20"]) {
      expect(parseLocalDateTime(bad), bad).toBeNull();
    }
  });

  it("finds the edges of an India day", () => {
    expect(startOfLocalDay("2026-11-20")?.toISOString()).toBe("2026-11-19T18:30:00.000Z");
    expect(endOfLocalDay("2026-11-20")?.toISOString()).toBe("2026-11-20T18:29:59.999Z");
  });

  it("shows a same-day event's date once", () => {
    const start = new Date("2026-11-20T04:30:00Z");
    const end = new Date("2026-11-20T08:30:00Z");
    expect(formatRange(start, end).match(/2026/g)).toHaveLength(1);
    expect(formatRange(start, new Date("2026-11-21T04:30:00Z")).match(/2026/g)).toHaveLength(2);
  });

  it("treats an evening near midnight UTC as the India day it falls on", () => {
    // 20:00 and 23:00 UTC are both on 21 Nov in India.
    const range = formatRange(new Date("2026-11-20T20:00:00Z"), new Date("2026-11-20T23:00:00Z"));
    expect(range).toContain("21 Nov");
    expect(range.match(/2026/g)).toHaveLength(1);
  });
});

describe("parseEventFilters", () => {
  it("has sensible defaults", () => {
    expect(parseEventFilters({})).toMatchObject({ tab: "upcoming", sort: "asc", page: 1, q: "" });
    expect(parseEventFilters({ tab: "past" })).toMatchObject({ tab: "past", sort: "desc" });
  });

  it("ignores odd values", () => {
    const f = parseEventFilters({ tab: "x", sort: "y", page: "-3", from: "soon", q: ["a"] });
    expect(f).toMatchObject({ tab: "upcoming", sort: "asc", page: 1, from: "", q: "" });
    expect(f.fromDate).toBeNull();
    expect(parseEventFilters({ page: "abc" }).page).toBe(1);
  });

  it("reads good values", () => {
    const f = parseEventFilters({ q: " hack ", from: "2026-11-20", page: "2", sort: "desc" });
    expect(f).toMatchObject({ q: "hack", from: "2026-11-20", page: 2, sort: "desc" });
    expect(f.fromDate?.toISOString()).toBe("2026-11-19T18:30:00.000Z");
  });
});

describe("buildIcs", () => {
  const ics = buildIcs({
    uid: "ev1@campus-events",
    title: "Hackathon; Finals, Day 1",
    description: "Line one\nLine two",
    location: "Main Auditorium",
    url: "https://example.com/events/hackathon",
    startsAt: new Date("2026-12-10T03:30:00Z"),
    endsAt: new Date("2026-12-11T03:30:00Z"),
    cancelled: false,
    now: new Date("2026-11-04T00:00:00Z"),
  });

  it("uses UTC times and calendar line endings", () => {
    expect(ics).toContain("DTSTART:20261210T033000Z\r\n");
    expect(ics).toContain("DTEND:20261211T033000Z\r\n");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("escapes special characters", () => {
    expect(ics).toContain("SUMMARY:Hackathon\\; Finals\\, Day 1");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("folds long lines at 75 bytes without splitting letters", () => {
    const long = buildIcs({
      uid: "ev2@campus-events",
      title: "हिंदी ".repeat(40),
      description: "",
      location: null,
      url: "https://example.com",
      startsAt: new Date(),
      endsAt: new Date(),
      cancelled: true,
      now: new Date(),
    });
    for (const line of long.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(long.replace(/\r\n /g, "")).toContain("हिंदी हिंदी");
    expect(long).toContain("STATUS:CANCELLED");
    expect(long).not.toContain("LOCATION");
  });
});
