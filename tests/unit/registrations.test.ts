import { describe, expect, it } from "vitest";
import type { EventStatus } from "@/generated/prisma/enums";
import { seatsLeft, seatsTaken, teamSharesSeat } from "@/lib/events";
import {
  applicantProblem,
  canChangeRegistration,
  eventEditProblem,
  groupMyEvents,
  membersNeeded,
  positionsToPromote,
  registrationBlock,
  teamHasRoom,
  waitlistGroups,
  windowProblem,
} from "@/lib/registrations";

const event = (status: EventStatus = "PUBLISHED", eligibility: never[] = []) => ({
  status,
  regOpensAt: new Date("2026-11-10T00:00:00Z"),
  regClosesAt: new Date("2026-11-20T00:00:00Z"),
  startsAt: new Date("2026-11-25T00:00:00Z"),
  endsAt: new Date("2026-11-26T00:00:00Z"),
  eligibility,
});

const beforeOpen = new Date("2026-11-05T00:00:00Z");
const open = new Date("2026-11-15T00:00:00Z");
const afterClose = new Date("2026-11-22T00:00:00Z");
const during = new Date("2026-11-25T12:00:00Z");
const afterEnd = new Date("2026-11-27T00:00:00Z");

const student = {
  role: "STUDENT" as const,
  emailVerified: true,
  rollNo: "CS101",
  departmentId: "cse",
  year: 3,
};

describe("windowProblem", () => {
  it("is open only between the opening and closing dates", () => {
    expect(windowProblem(event(), open)).toBeNull();
    expect(windowProblem(event(), event().regOpensAt)).toBeNull();
    expect(windowProblem(event(), beforeOpen)).toMatch(/^Registration opens /);
    expect(windowProblem(event(), event().regClosesAt)).toMatch(/closed/);
    expect(windowProblem(event(), afterClose)).toMatch(/closed/);
  });

  it("explains every other status", () => {
    expect(windowProblem(event("DRAFT"), open)).toMatch(/published/);
    expect(windowProblem(event("CANCELLED"), open)).toMatch(/cancelled/);
    expect(windowProblem(event(), during)).toMatch(/started/);
    expect(windowProblem(event(), afterEnd)).toMatch(/over/);
  });

  it("stays closed when an admin closed registration early", () => {
    expect(windowProblem(event("REG_CLOSED"), open)).toMatch(/closed/);
  });
});

describe("applicantProblem", () => {
  it("lets an eligible student through", () => {
    expect(applicantProblem(event(), student)).toBeNull();
  });

  it("turns away staff", () => {
    expect(applicantProblem(event(), { ...student, role: "COORDINATOR" })?.message).toMatch(
      /student/,
    );
    expect(applicantProblem(event(), { ...student, role: "ADMIN" })?.message).toMatch(/student/);
  });

  it("asks for a verified email", () => {
    expect(applicantProblem(event(), { ...student, emailVerified: false })?.message).toMatch(
      /Verify/,
    );
  });

  it("links an incomplete profile to the page that fixes it", () => {
    for (const missing of [{ rollNo: null }, { departmentId: null }, { year: null }]) {
      expect(applicantProblem(event(), { ...student, ...missing })?.fix?.href).toBe("/profile");
    }
  });

  it("checks eligibility", () => {
    const limited = {
      ...event(),
      eligibility: [{ departmentId: "it", year: null }],
    };
    expect(applicantProblem(limited, student)?.message).toMatch(/isn't open/);
    expect(applicantProblem(limited, { ...student, departmentId: "it" })).toBeNull();
  });
});

describe("registrationBlock", () => {
  it("reports the window first, since nothing else matters when it's shut", () => {
    expect(
      registrationBlock(event(), { ...student, emailVerified: false }, afterClose)?.message,
    ).toMatch(/closed/);
  });

  it("then reports the person", () => {
    expect(registrationBlock(event(), { ...student, emailVerified: false }, open)?.message).toMatch(
      /Verify/,
    );
    expect(registrationBlock(event(), student, open)).toBeNull();
  });
});

describe("canChangeRegistration", () => {
  it("allows changes until registration closes", () => {
    expect(canChangeRegistration(event(), open)).toBe(true);
    expect(canChangeRegistration(event(), afterClose)).toBe(false);
    expect(canChangeRegistration(event("REG_CLOSED"), open)).toBe(false);
    expect(canChangeRegistration(event("CANCELLED"), open)).toBe(false);
  });

  it("still allows them if the opening date was moved later", () => {
    expect(canChangeRegistration(event(), beforeOpen)).toBe(true);
  });
});

describe("team sizes", () => {
  it("counts members still needed", () => {
    expect(membersNeeded(1, 3)).toBe(2);
    expect(membersNeeded(3, 3)).toBe(0);
    expect(membersNeeded(4, 3)).toBe(0);
    expect(membersNeeded(0, null)).toBe(1);
  });

  it("counts pending invites against the maximum", () => {
    expect(teamHasRoom(2, 1, 4)).toBe(true);
    expect(teamHasRoom(2, 2, 4)).toBe(false);
    expect(teamHasRoom(4, 0, 4)).toBe(false);
    expect(teamHasRoom(50, 50, null)).toBe(true);
  });
});

describe("seat counting", () => {
  const counts = { registrations: 9, teams: 3 };

  it("counts people on solo events", () => {
    const solo = { participation: "SOLO" as const, seatPer: "TEAM" as const, _count: counts };
    expect(teamSharesSeat(solo)).toBe(false);
    expect(seatsTaken(solo)).toBe(9);
  });

  it("counts teams when a team shares a seat", () => {
    const team = { participation: "TEAM" as const, seatPer: "TEAM" as const, _count: counts };
    expect(teamSharesSeat(team)).toBe(true);
    expect(seatsTaken(team)).toBe(3);
    expect(seatsLeft(10, seatsTaken(team))).toBe(7);
  });

  it("counts people when each member takes a seat", () => {
    const team = { participation: "TEAM" as const, seatPer: "MEMBER" as const, _count: counts };
    expect(teamSharesSeat(team)).toBe(false);
    expect(seatsTaken(team)).toBe(9);
  });
});

describe("waitlist", () => {
  it("groups a team's rows into one place, in queue order", () => {
    expect(waitlistGroups([3, 1, 3, 2, 3], false)).toEqual([
      { position: 1, seats: 1 },
      { position: 2, seats: 1 },
      { position: 3, seats: 3 },
    ]);
  });

  it("needs one seat per place when a team shares a seat", () => {
    expect(waitlistGroups([1, 1, 1, 2, 2], true)).toEqual([
      { position: 1, seats: 1 },
      { position: 2, seats: 1 },
    ]);
  });

  it("fills seats first come first served", () => {
    const groups = [1, 2, 3].map((position) => ({ position, seats: 1 }));
    expect(positionsToPromote(groups, 0)).toEqual([]);
    expect(positionsToPromote(groups, 1)).toEqual([1]);
    expect(positionsToPromote(groups, 2)).toEqual([1, 2]);
    expect(positionsToPromote(groups, 9)).toEqual([1, 2, 3]);
  });

  it("skips a place that doesn't fit and takes the next that does", () => {
    const groups = [
      { position: 1, seats: 3 },
      { position: 2, seats: 2 },
      { position: 3, seats: 1 },
    ];
    expect(positionsToPromote(groups, 2)).toEqual([2]);
    expect(positionsToPromote(groups, 3)).toEqual([1]);
    expect(positionsToPromote(groups, 4)).toEqual([1, 3]);
  });

  it("promotes everyone when there's no limit", () => {
    expect(positionsToPromote([{ position: 1, seats: 3 }], null)).toEqual([1]);
  });
});

describe("eventEditProblem", () => {
  const solo = {
    participation: "SOLO" as const,
    teamMin: null,
    teamMax: null,
    seatPer: "TEAM" as const,
  };
  const team = { participation: "TEAM" as const, teamMin: 2, teamMax: 4, seatPer: "TEAM" as const };
  const none = { registrations: 0, teams: 0, seatsTaken: 0 };

  it("allows anything before people join", () => {
    expect(eventEditProblem(solo, { ...team, capacity: 1 }, none)).toBeNull();
  });

  it("locks solo or team once anyone has joined", () => {
    expect(
      eventEditProblem(solo, { ...team, capacity: null }, { ...none, registrations: 1 })?.field,
    ).toBe("participation");
    expect(eventEditProblem(team, { ...solo, capacity: null }, { ...none, teams: 1 })?.field).toBe(
      "participation",
    );
  });

  it("locks team settings once a team exists", () => {
    const usage = { ...none, teams: 1 };
    const next = { ...team, capacity: null };
    expect(eventEditProblem(team, next, usage)).toBeNull();
    expect(eventEditProblem(team, { ...next, teamMin: 3 }, usage)?.field).toBe("teamMin");
    expect(eventEditProblem(team, { ...next, teamMax: 5 }, usage)?.field).toBe("teamMax");
    expect(eventEditProblem(team, { ...next, seatPer: "MEMBER" }, usage)?.field).toBe("seatPer");
  });

  it("won't lower capacity below the seats taken", () => {
    const usage = { ...none, registrations: 5, seatsTaken: 5 };
    expect(eventEditProblem(solo, { ...solo, capacity: 4 }, usage)?.field).toBe("capacity");
    expect(eventEditProblem(solo, { ...solo, capacity: 5 }, usage)).toBeNull();
    expect(eventEditProblem(solo, { ...solo, capacity: null }, usage)).toBeNull();
  });
});

describe("groupMyEvents", () => {
  const reg = (id: string, status: "CONFIRMED" | "WAITLISTED" | "CANCELLED", e = event()) => ({
    id,
    status,
    event: e,
  });
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  it("sorts registrations into sections", () => {
    const groups = groupMyEvents(
      [
        reg("confirmed", "CONFIRMED"),
        reg("waiting", "WAITLISTED"),
        reg("left", "CANCELLED"),
        reg("off", "CONFIRMED", event("CANCELLED")),
      ],
      open,
    );
    expect(ids(groups.upcoming)).toEqual(["confirmed"]);
    expect(ids(groups.waitlisted)).toEqual(["waiting"]);
    expect(ids(groups.past)).toEqual(["off"]);
  });

  it("moves finished events to past, even if still waitlisted", () => {
    const groups = groupMyEvents([reg("a", "CONFIRMED"), reg("b", "WAITLISTED")], afterEnd);
    expect(groups.upcoming).toEqual([]);
    expect(groups.waitlisted).toEqual([]);
    expect(ids(groups.past).sort()).toEqual(["a", "b"]);
  });

  it("keeps an event upcoming while it's happening", () => {
    expect(ids(groupMyEvents([reg("a", "CONFIRMED")], during).upcoming)).toEqual(["a"]);
  });

  it("shows soonest first, and latest first in past", () => {
    const at = (day: string) => ({
      ...event("COMPLETED"),
      startsAt: new Date(`2026-11-${day}T00:00:00Z`),
    });
    const later = { ...event(), startsAt: new Date("2026-12-01T00:00:00Z") };
    const soon = { ...event(), startsAt: new Date("2026-11-25T00:00:00Z") };
    const groups = groupMyEvents(
      [
        reg("later", "CONFIRMED", { ...later, endsAt: new Date("2026-12-02T00:00:00Z") }),
        reg("soon", "CONFIRMED", soon),
        reg("old", "CONFIRMED", at("01")),
        reg("recent", "CONFIRMED", at("03")),
      ],
      open,
    );
    expect(ids(groups.upcoming)).toEqual(["soon", "later"]);
    expect(ids(groups.past)).toEqual(["recent", "old"]);
  });
});
