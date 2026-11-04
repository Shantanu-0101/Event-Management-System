import { describe, expect, it } from "vitest";
import type { EventStatus } from "@/generated/prisma/enums";
import {
  effectiveStatus,
  eligibilityChoice,
  eligibilityRows,
  isEditable,
  isEligible,
  publishProblem,
  registrationNote,
  seatsLeft,
  statusActions,
} from "@/lib/events";

const event = (status: EventStatus) => ({
  status,
  regOpensAt: new Date("2026-11-10T00:00:00Z"),
  regClosesAt: new Date("2026-11-20T00:00:00Z"),
  startsAt: new Date("2026-11-25T00:00:00Z"),
  endsAt: new Date("2026-11-26T00:00:00Z"),
});

const beforeClose = new Date("2026-11-15T00:00:00Z");
const afterClose = new Date("2026-11-22T00:00:00Z");
const during = new Date("2026-11-25T12:00:00Z");
const afterEnd = new Date("2026-11-27T00:00:00Z");

describe("effectiveStatus", () => {
  it("moves a published event on as its dates pass", () => {
    expect(effectiveStatus(event("PUBLISHED"), beforeClose)).toBe("PUBLISHED");
    expect(effectiveStatus(event("PUBLISHED"), afterClose)).toBe("REG_CLOSED");
    expect(effectiveStatus(event("PUBLISHED"), during)).toBe("ONGOING");
    expect(effectiveStatus(event("PUBLISHED"), afterEnd)).toBe("COMPLETED");
  });

  it("changes exactly at each boundary", () => {
    const e = event("PUBLISHED");
    expect(effectiveStatus(e, e.regClosesAt)).toBe("REG_CLOSED");
    expect(effectiveStatus(e, e.startsAt)).toBe("ONGOING");
    expect(effectiveStatus(e, e.endsAt)).toBe("COMPLETED");
  });

  it("keeps registration closed once an admin closed it early", () => {
    expect(effectiveStatus(event("REG_CLOSED"), beforeClose)).toBe("REG_CLOSED");
    expect(effectiveStatus(event("REG_CLOSED"), during)).toBe("ONGOING");
  });

  it("never moves drafts, cancelled or completed events", () => {
    for (const status of ["DRAFT", "CANCELLED", "COMPLETED"] as const) {
      expect(effectiveStatus(event(status), afterEnd)).toBe(status);
      expect(effectiveStatus(event(status), beforeClose)).toBe(status);
    }
  });
});

describe("isEditable", () => {
  it("locks finished and cancelled events", () => {
    expect(isEditable(event("DRAFT"), afterEnd)).toBe(true);
    expect(isEditable(event("PUBLISHED"), during)).toBe(true);
    expect(isEditable(event("PUBLISHED"), afterEnd)).toBe(false);
    expect(isEditable(event("CANCELLED"), beforeClose)).toBe(false);
  });
});

describe("statusActions", () => {
  it("gives admins the next steps for each status", () => {
    expect(statusActions(event("DRAFT"), "ADMIN", beforeClose)).toEqual(["publish", "cancel"]);
    expect(statusActions(event("PUBLISHED"), "ADMIN", beforeClose)).toEqual(["close", "cancel"]);
    expect(statusActions(event("REG_CLOSED"), "ADMIN", beforeClose)).toEqual(["reopen", "cancel"]);
  });

  it("does not offer reopening once the window is over", () => {
    expect(statusActions(event("REG_CLOSED"), "ADMIN", afterClose)).toEqual(["cancel"]);
    expect(statusActions(event("PUBLISHED"), "ADMIN", afterClose)).toEqual(["cancel"]);
  });

  it("offers nothing once the event has started or ended", () => {
    for (const now of [during, afterEnd]) {
      expect(statusActions(event("PUBLISHED"), "ADMIN", now)).toEqual([]);
    }
    expect(statusActions(event("CANCELLED"), "ADMIN", beforeClose)).toEqual([]);
  });

  it("lets coordinators only close registration", () => {
    expect(statusActions(event("PUBLISHED"), "COORDINATOR", beforeClose)).toEqual(["close"]);
    expect(statusActions(event("DRAFT"), "COORDINATOR", beforeClose)).toEqual([]);
    expect(statusActions(event("REG_CLOSED"), "COORDINATOR", beforeClose)).toEqual([]);
  });

  it("gives students nothing", () => {
    expect(statusActions(event("PUBLISHED"), "STUDENT", beforeClose)).toEqual([]);
  });

  it("won't publish a draft whose window is over", () => {
    expect(publishProblem(event("DRAFT"), beforeClose)).toBeNull();
    expect(publishProblem(event("DRAFT"), afterClose)).toMatch(/over/);
    expect(statusActions(event("DRAFT"), "ADMIN", afterClose)).toEqual(["cancel"]);
  });
});

describe("eligibility", () => {
  const cse3 = { departmentId: "cse", year: 3 };

  it("treats no rows as open to everyone", () => {
    expect(eligibilityRows([], [])).toEqual([]);
    expect(isEligible([], cse3)).toBe(true);
    expect(isEligible([], { departmentId: null, year: null })).toBe(true);
  });

  it("limits by department only", () => {
    const rows = eligibilityRows(["cse", "it"], []);
    expect(rows).toEqual([
      { departmentId: "cse", year: null },
      { departmentId: "it", year: null },
    ]);
    expect(isEligible(rows, cse3)).toBe(true);
    expect(isEligible(rows, { departmentId: "mech", year: 3 })).toBe(false);
  });

  it("limits by year only", () => {
    const rows = eligibilityRows([], [3, 4]);
    expect(isEligible(rows, cse3)).toBe(true);
    expect(isEligible(rows, { departmentId: "cse", year: 1 })).toBe(false);
  });

  it("needs both when both are set", () => {
    const rows = eligibilityRows(["cse"], [4]);
    expect(isEligible(rows, { departmentId: "cse", year: 4 })).toBe(true);
    expect(isEligible(rows, { departmentId: "cse", year: 3 })).toBe(false);
    expect(isEligible(rows, { departmentId: "it", year: 4 })).toBe(false);
  });

  it("turns rows back into the same ticked boxes", () => {
    expect(eligibilityChoice(eligibilityRows(["cse", "it"], [4, 3]))).toEqual({
      departmentIds: ["cse", "it"],
      years: [3, 4],
    });
    expect(eligibilityChoice([])).toEqual({ departmentIds: [], years: [] });
  });
});

describe("seatsLeft", () => {
  it("counts down and stops at zero", () => {
    expect(seatsLeft(10, 3)).toBe(7);
    expect(seatsLeft(10, 10)).toBe(0);
    expect(seatsLeft(10, 12)).toBe(0);
  });

  it("returns null when there is no limit", () => {
    expect(seatsLeft(null, 50)).toBeNull();
  });
});

describe("registrationNote", () => {
  it("describes the window", () => {
    const e = event("PUBLISHED");
    expect(registrationNote(e, new Date("2026-11-01T00:00:00Z"))).toMatch(/^Opens /);
    expect(registrationNote(e, beforeClose)).toMatch(/^Open until /);
    expect(registrationNote(e, afterClose)).toBe("Closed");
    expect(registrationNote(event("CANCELLED"), beforeClose)).toBe("Closed");
  });
});
