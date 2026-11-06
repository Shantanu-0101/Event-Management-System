import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Participation, SeatPer } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { eventInputDefaults } from "./fixtures";
import { changeEventStatus, updateEvent } from "@/server/services/events";
import {
  cancelRegistration,
  createTeam,
  disbandTeam,
  getRegistrationView,
  inviteToTeam,
  leaveTeam,
  registerForEvent,
  RegistrationError,
  removeTeamMember,
  respondToInvite,
} from "@/server/services/registrations";
import { assertSafeTestDatabase } from "./test-database";

assertSafeTestDatabase(process.env.DATABASE_URL ?? "");

const NOW = new Date("2026-11-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

let adminId: string;
let categoryId: string;
let cseId: string;
let itId: string;

async function wipe() {
  await prisma.auditLog.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.eventEligibility.deleteMany();
  await prisma.eventCoordinator.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.department.deleteMany();
}

beforeEach(async () => {
  await wipe();
  const [cse, it, category, admin] = await Promise.all([
    prisma.department.create({ data: { code: "CSE", name: "Computer Science" } }),
    prisma.department.create({ data: { code: "IT", name: "Information Technology" } }),
    prisma.category.create({ data: { name: "Hackathon", slug: "hackathon" } }),
    prisma.user.create({
      data: { name: "Admin", email: "admin@test.local", role: "ADMIN", emailVerifiedAt: NOW },
    }),
  ]);
  cseId = cse.id;
  itId = it.id;
  categoryId = category.id;
  adminId = admin.id;
});

afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

async function makeStudents(count: number, prefix = "s") {
  const rows = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      prisma.user.create({
        data: {
          name: `Student ${prefix}${i}`,
          email: `${prefix}${i}@test.local`,
          rollNo: `${prefix.toUpperCase()}${i}00`,
          departmentId: cseId,
          year: 3,
          emailVerifiedAt: NOW,
        },
      }),
    ),
  );
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    rollNo: u.rollNo,
    departmentId: u.departmentId,
    year: u.year,
    emailVerified: true,
  }));
}

async function makeEvent(
  options: {
    capacity?: number | null;
    participation?: Participation;
    teamMin?: number;
    teamMax?: number;
    seatPer?: SeatPer;
    regOpensAt?: Date;
    regClosesAt?: Date;
  } = {},
) {
  return prisma.event.create({
    data: {
      title: "Test event",
      slug: `test-${Math.random().toString(36).slice(2)}`,
      description: "<p>Test</p>",
      categoryId,
      createdById: adminId,
      status: "PUBLISHED",
      regOpensAt: options.regOpensAt ?? new Date(NOW.getTime() - DAY),
      regClosesAt: options.regClosesAt ?? new Date(NOW.getTime() + DAY),
      startsAt: new Date(NOW.getTime() + 5 * DAY),
      endsAt: new Date(NOW.getTime() + 6 * DAY),
      capacity: options.capacity ?? null,
      participation: options.participation ?? "SOLO",
      teamMin: options.teamMin ?? null,
      teamMax: options.teamMax ?? null,
      seatPer: options.seatPer ?? "TEAM",
    },
  });
}

const counts = async (eventId: string) => ({
  confirmed: await prisma.registration.count({ where: { eventId, status: "CONFIRMED" } }),
  waitlisted: await prisma.registration.count({ where: { eventId, status: "WAITLISTED" } }),
});

const statusOf = async (eventId: string, userId: string) =>
  (await prisma.registration.findUnique({ where: { eventId_userId: { eventId, userId } } }))
    ?.status;

const sentTo = (result: { emails: { to: string }[] }) => result.emails.map((e) => e.to);

describe("parallel registration", () => {
  it("never confirms more than 10 seats when 50 students register at once", async () => {
    const event = await makeEvent({ capacity: 10 });
    const students = await makeStudents(50);

    const results = await Promise.allSettled(
      students.map((s) => registerForEvent(s, event.id, NOW)),
    );

    expect(results.filter((r) => r.status === "rejected")).toEqual([]);
    expect(await counts(event.id)).toEqual({ confirmed: 10, waitlisted: 40 });

    const positions = await prisma.registration.findMany({
      where: { eventId: event.id, status: "WAITLISTED" },
      select: { waitlistPosition: true },
    });
    const sorted = positions.map((p) => p.waitlistPosition).sort((a, b) => a! - b!);
    expect(sorted).toEqual(Array.from({ length: 40 }, (_, i) => i + 1));
  });

  it("doesn't double-register one student clicking many times at once", async () => {
    const event = await makeEvent({ capacity: 10 });
    const [student] = await makeStudents(1);

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => registerForEvent(student, event.id, NOW)),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await counts(event.id)).toEqual({ confirmed: 1, waitlisted: 0 });
  });
});

describe("solo registration", () => {
  it("confirms while seats last, then waitlists", async () => {
    const event = await makeEvent({ capacity: 1 });
    const [a, b] = await makeStudents(2);

    expect(await registerForEvent(a, event.id, NOW)).toEqual({ status: "CONFIRMED" });
    expect(await registerForEvent(b, event.id, NOW)).toEqual({ status: "WAITLISTED" });
  });

  it("refuses a duplicate", async () => {
    const event = await makeEvent();
    const [a] = await makeStudents(1);
    await registerForEvent(a, event.id, NOW);
    await expect(registerForEvent(a, event.id, NOW)).rejects.toThrow(/already registered/);
  });

  it("refuses outside the window", async () => {
    const early = await makeEvent({ regOpensAt: new Date(NOW.getTime() + DAY) });
    const late = await makeEvent({
      regOpensAt: new Date(NOW.getTime() - 2 * DAY),
      regClosesAt: new Date(NOW.getTime() - DAY),
    });
    const [a] = await makeStudents(1);
    await expect(registerForEvent(a, early.id, NOW)).rejects.toThrow(/opens/);
    await expect(registerForEvent(a, late.id, NOW)).rejects.toThrow(/closed/);
  });

  it("refuses an ineligible department", async () => {
    const event = await makeEvent();
    await prisma.eventEligibility.create({ data: { eventId: event.id, departmentId: itId } });
    const [a] = await makeStudents(1);
    await expect(registerForEvent(a, event.id, NOW)).rejects.toThrow(/isn't open/);
  });

  it("refuses unverified students, incomplete profiles and staff", async () => {
    const event = await makeEvent();
    const [a] = await makeStudents(1);
    await expect(registerForEvent({ ...a, emailVerified: false }, event.id, NOW)).rejects.toThrow(
      /Verify/,
    );
    await expect(registerForEvent({ ...a, year: null }, event.id, NOW)).rejects.toThrow(
      /profile|Add/,
    );
    await expect(registerForEvent({ ...a, role: "COORDINATOR" }, event.id, NOW)).rejects.toThrow(
      /student/,
    );
  });

  it("refuses a team event", async () => {
    const event = await makeEvent({ participation: "TEAM", teamMin: 2, teamMax: 3 });
    const [a] = await makeStudents(1);
    await expect(registerForEvent(a, event.id, NOW)).rejects.toThrow(/team event/);
  });
});

describe("cancelling and the waitlist", () => {
  it("promotes the first in line and emails only them", async () => {
    const event = await makeEvent({ capacity: 1 });
    const [a, b, c] = await makeStudents(3);
    await registerForEvent(a, event.id, NOW);
    await registerForEvent(b, event.id, NOW);
    await registerForEvent(c, event.id, NOW);

    const result = await cancelRegistration(a, event.id, NOW);

    expect(await statusOf(event.id, a.id)).toBe("CANCELLED");
    expect(await statusOf(event.id, b.id)).toBe("CONFIRMED");
    expect(await statusOf(event.id, c.id)).toBe("WAITLISTED");
    expect(sentTo(result)).toEqual([b.email]);
    expect((await getRegistrationView(event.id, c.id)).waitlistRank).toBe(1);
  });

  it("doesn't promote anyone when a waitlisted student leaves", async () => {
    const event = await makeEvent({ capacity: 1 });
    const [a, b, c] = await makeStudents(3);
    await registerForEvent(a, event.id, NOW);
    await registerForEvent(b, event.id, NOW);
    await registerForEvent(c, event.id, NOW);

    const result = await cancelRegistration(b, event.id, NOW);

    expect(result.emails).toEqual([]);
    expect(await counts(event.id)).toEqual({ confirmed: 1, waitlisted: 1 });
  });

  it("sends someone who cancelled and returns to the back of the queue", async () => {
    const event = await makeEvent({ capacity: 1 });
    const [a, b] = await makeStudents(2);
    await registerForEvent(a, event.id, NOW);
    await registerForEvent(b, event.id, NOW);
    await cancelRegistration(a, event.id, NOW);

    expect(await registerForEvent(a, event.id, NOW)).toEqual({ status: "WAITLISTED" });
    expect(await statusOf(event.id, b.id)).toBe("CONFIRMED");
  });

  it("refuses cancelling after registration closes", async () => {
    const event = await makeEvent();
    const [a] = await makeStudents(1);
    await registerForEvent(a, event.id, NOW);
    const later = new Date(NOW.getTime() + 2 * DAY);
    await expect(cancelRegistration(a, event.id, later)).rejects.toThrow(/closed/);
  });

  it("refuses cancelling a registration that doesn't exist", async () => {
    const event = await makeEvent();
    const [a] = await makeStudents(1);
    await expect(cancelRegistration(a, event.id, NOW)).rejects.toThrow(RegistrationError);
  });
});

describe("teams", () => {
  const teamEvent = (extra: Parameters<typeof makeEvent>[0] = {}) =>
    makeEvent({ participation: "TEAM", teamMin: 3, teamMax: 4, ...extra });

  async function formTeam(eventId: string, members: Awaited<ReturnType<typeof makeStudents>>) {
    const [leader, ...rest] = members;
    const { teamId } = await createTeam(leader, eventId, `Team ${leader.rollNo}`, NOW);
    for (const member of rest) {
      await inviteToTeam(leader, teamId, member.rollNo!, NOW);
      await respondToInvite(member, teamId, true, NOW);
    }
    return teamId;
  }

  it("a team of 3 forms and registers when it reaches the minimum", async () => {
    const event = await teamEvent();
    const [leader, b, c] = await makeStudents(3);

    const { teamId } = await createTeam(leader, event.id, "Byte Club", NOW);
    expect(await counts(event.id)).toEqual({ confirmed: 0, waitlisted: 0 });

    await inviteToTeam(leader, teamId, b.rollNo!.toLowerCase(), NOW);
    await inviteToTeam(leader, teamId, c.email.toUpperCase(), NOW);

    await respondToInvite(b, teamId, true, NOW);
    expect(await counts(event.id)).toEqual({ confirmed: 0, waitlisted: 0 });

    const result = await respondToInvite(c, teamId, true, NOW);
    expect(await counts(event.id)).toEqual({ confirmed: 3, waitlisted: 0 });
    expect(sentTo(result).sort()).toEqual([leader.email, b.email, c.email].sort());
  });

  it("registers straight away when the minimum is one", async () => {
    const event = await teamEvent({ teamMin: 1 });
    const [leader] = await makeStudents(1);
    await createTeam(leader, event.id, "Solo squad", NOW);
    expect(await statusOf(event.id, leader.id)).toBe("CONFIRMED");
  });

  it("a later member joins with the team's place", async () => {
    const event = await teamEvent();
    const members = await makeStudents(4);
    const teamId = await formTeam(event.id, members.slice(0, 3));

    await inviteToTeam(members[0], teamId, members[3].rollNo!, NOW);
    await respondToInvite(members[3], teamId, true, NOW);

    expect(await statusOf(event.id, members[3].id)).toBe("CONFIRMED");
  });

  it("enforces the maximum, counting pending invites", async () => {
    const event = await teamEvent({ teamMax: 3 });
    const [leader, b, c, d] = await makeStudents(4);
    const { teamId } = await createTeam(leader, event.id, "Trio", NOW);
    await inviteToTeam(leader, teamId, b.rollNo!, NOW);
    await inviteToTeam(leader, teamId, c.rollNo!, NOW);
    await expect(inviteToTeam(leader, teamId, d.rollNo!, NOW)).rejects.toThrow(/at most 3/);
  });

  it("keeps a student on one team per event", async () => {
    const event = await teamEvent({ teamMin: 2 });
    const [a, b, c] = await makeStudents(3);
    const first = await createTeam(a, event.id, "First", NOW);
    const second = await createTeam(c, event.id, "Second", NOW);

    await inviteToTeam(a, first.teamId, b.rollNo!, NOW);
    await inviteToTeam(c, second.teamId, b.rollNo!, NOW);
    await respondToInvite(b, first.teamId, true, NOW);

    // Accepting one invite closes the other.
    await expect(respondToInvite(b, second.teamId, true, NOW)).rejects.toThrow(/no longer open/);
    await expect(inviteToTeam(c, second.teamId, b.rollNo!, NOW)).rejects.toThrow(/another team/);
    await expect(createTeam(b, event.id, "Third", NOW)).rejects.toThrow(/already on team/);
  });

  it("refuses duplicate team names, whatever the case", async () => {
    const event = await teamEvent();
    const [a, b] = await makeStudents(2);
    await createTeam(a, event.id, "Byte Club", NOW);
    await expect(createTeam(b, event.id, "byte club", NOW)).rejects.toThrow(
      /already has that name/,
    );
  });

  it("refuses unknown, ineligible and self invites", async () => {
    const event = await teamEvent();
    await prisma.eventEligibility.create({
      data: { eventId: event.id, departmentId: cseId },
    });
    const [leader, outsider] = await makeStudents(2);
    await prisma.user.update({ where: { id: outsider.id }, data: { departmentId: itId } });
    const { teamId } = await createTeam(leader, event.id, "Byte Club", NOW);

    await expect(inviteToTeam(leader, teamId, "NOBODY", NOW)).rejects.toThrow(/No student/);
    await expect(inviteToTeam(leader, teamId, outsider.rollNo!, NOW)).rejects.toThrow(/eligible/);
    await expect(inviteToTeam(leader, teamId, leader.rollNo!, NOW)).rejects.toThrow(/already on/);
  });

  it("only lets the leader invite, remove and disband", async () => {
    const event = await teamEvent({ teamMin: 2 });
    const [leader, member, other] = await makeStudents(3);
    const teamId = await formTeam(event.id, [leader, member]);

    await expect(inviteToTeam(member, teamId, other.rollNo!, NOW)).rejects.toThrow(/leader/);
    await expect(removeTeamMember(member, teamId, leader.id, NOW)).rejects.toThrow(/leader/);
    await expect(disbandTeam(member, teamId, NOW)).rejects.toThrow(/leader/);
    await expect(leaveTeam(leader, teamId, NOW)).rejects.toThrow(/Disband/);
  });

  it("lets a declined student be invited again", async () => {
    const event = await teamEvent();
    const [leader, b] = await makeStudents(2);
    const { teamId } = await createTeam(leader, event.id, "Byte Club", NOW);

    await inviteToTeam(leader, teamId, b.rollNo!, NOW);
    const declined = await respondToInvite(b, teamId, false, NOW);
    expect(sentTo(declined)).toEqual([leader.email]);

    await inviteToTeam(leader, teamId, b.rollNo!, NOW);
    await respondToInvite(b, teamId, true, NOW);
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: b.id } },
    });
    expect(member?.status).toBe("ACCEPTED");
  });

  it("loses its place when a member leaves it below the minimum, and can register again", async () => {
    const event = await teamEvent({ capacity: 1 });
    const first = await makeStudents(3, "a");
    const waiting = await makeStudents(3, "b");
    const firstTeam = await formTeam(event.id, first);
    await formTeam(event.id, waiting);
    expect(await statusOf(event.id, waiting[0].id)).toBe("WAITLISTED");

    const result = await leaveTeam(first[2], firstTeam, NOW);

    // The team is short, so its seat goes to the team waiting.
    expect(await statusOf(event.id, first[0].id)).toBe("CANCELLED");
    expect(await statusOf(event.id, first[2].id)).toBe("CANCELLED");
    expect(await statusOf(event.id, waiting[0].id)).toBe("CONFIRMED");
    expect(sentTo(result)).toEqual(
      expect.arrayContaining([first[0].email, first[1].email, waiting[0].email]),
    );

    // Back at the minimum, the first team joins the queue again.
    const [replacement] = await makeStudents(1, "c");
    await inviteToTeam(first[0], firstTeam, replacement.rollNo!, NOW);
    await respondToInvite(replacement, firstTeam, true, NOW);
    expect(await statusOf(event.id, first[0].id)).toBe("WAITLISTED");
    expect(await statusOf(event.id, replacement.id)).toBe("WAITLISTED");
  });

  it("disbanding frees the seat and the name", async () => {
    const event = await teamEvent({ capacity: 1 });
    const first = await makeStudents(3, "a");
    const waiting = await makeStudents(3, "b");
    const teamId = await formTeam(event.id, first);
    await formTeam(event.id, waiting);

    const result = await disbandTeam(first[0], teamId, NOW);

    expect(await prisma.team.count({ where: { id: teamId } })).toBe(0);
    expect(await statusOf(event.id, first[1].id)).toBe("CANCELLED");
    expect(await statusOf(event.id, waiting[2].id)).toBe("CONFIRMED");
    expect(sentTo(result)).toEqual(
      expect.arrayContaining([first[1].email, first[2].email, waiting[0].email]),
    );
    await createTeam(first[0], event.id, `Team ${first[0].rollNo}`, NOW);
  });

  it("refuses team changes after registration closes", async () => {
    const event = await teamEvent({ teamMin: 2 });
    const [leader, member, other] = await makeStudents(3);
    const teamId = await formTeam(event.id, [leader, member]);
    const later = new Date(NOW.getTime() + 2 * DAY);

    await expect(inviteToTeam(leader, teamId, other.rollNo!, later)).rejects.toThrow(/closed/);
    await expect(removeTeamMember(leader, teamId, member.id, later)).rejects.toThrow(/closed/);
    await expect(leaveTeam(member, teamId, later)).rejects.toThrow(/closed/);
    await expect(disbandTeam(leader, teamId, later)).rejects.toThrow(/closed/);
  });

  describe("one seat per team", () => {
    it("counts a team as one seat however many members it has", async () => {
      const event = await teamEvent({ capacity: 1, seatPer: "TEAM" });
      const first = await makeStudents(3, "a");
      const second = await makeStudents(3, "b");

      await formTeam(event.id, first);
      await formTeam(event.id, second);

      expect(await counts(event.id)).toEqual({ confirmed: 3, waitlisted: 3 });
      const positions = await prisma.registration.findMany({
        where: { eventId: event.id, status: "WAITLISTED" },
        select: { waitlistPosition: true },
      });
      expect(new Set(positions.map((p) => p.waitlistPosition)).size).toBe(1);
    });

    it("lets a member join a full event's confirmed team", async () => {
      const event = await teamEvent({ capacity: 1, seatPer: "TEAM" });
      const members = await makeStudents(4);
      const teamId = await formTeam(event.id, members.slice(0, 3));

      await inviteToTeam(members[0], teamId, members[3].rollNo!, NOW);
      await respondToInvite(members[3], teamId, true, NOW);

      expect(await statusOf(event.id, members[3].id)).toBe("CONFIRMED");
    });
  });

  describe("one seat per member", () => {
    it("waitlists the whole team when too few seats are left", async () => {
      const event = await teamEvent({ capacity: 4, seatPer: "MEMBER", teamMax: 4 });
      const first = await makeStudents(3, "a");
      const second = await makeStudents(3, "b");

      await formTeam(event.id, first);
      await formTeam(event.id, second);

      expect(await counts(event.id)).toEqual({ confirmed: 3, waitlisted: 3 });
    });

    it("won't seat one more member when the event is full", async () => {
      const event = await teamEvent({ capacity: 3, seatPer: "MEMBER", teamMax: 4 });
      const members = await makeStudents(4);
      const teamId = await formTeam(event.id, members.slice(0, 3));

      await inviteToTeam(members[0], teamId, members[3].rollNo!, NOW);
      await expect(respondToInvite(members[3], teamId, true, NOW)).rejects.toThrow(/no seats left/);
      expect(await counts(event.id)).toEqual({ confirmed: 3, waitlisted: 0 });
    });

    it("promotes the next team that fits when the first in line is too big", async () => {
      const event = await teamEvent({ capacity: 5, seatPer: "MEMBER", teamMin: 2, teamMax: 4 });
      const seated = await makeStudents(4, "a");
      const big = await makeStudents(3, "b");
      const small = await makeStudents(2, "c");
      const seatedTeam = await formTeam(event.id, seated);
      await formTeam(event.id, big);
      await formTeam(event.id, small);
      expect(await statusOf(event.id, big[0].id)).toBe("WAITLISTED");
      expect(await statusOf(event.id, small[0].id)).toBe("WAITLISTED");

      // One seat was free; this frees a second. Big needs 3, small needs 2.
      await leaveTeam(seated[3], seatedTeam, NOW);

      expect(await statusOf(event.id, big[0].id)).toBe("WAITLISTED");
      expect(await statusOf(event.id, small[0].id)).toBe("CONFIRMED");
    });
  });
});

describe("editing and cancelling an event that has registrations", () => {
  const edit = (
    event: Awaited<ReturnType<typeof makeEvent>>,
    changes: Partial<Parameters<typeof updateEvent>[2]>,
  ) =>
    updateEvent({ id: adminId, role: "ADMIN" }, event.id, eventInputDefaults(event, changes), NOW);

  it("won't lower capacity below the seats taken", async () => {
    const event = await makeEvent({ capacity: 5 });
    const students = await makeStudents(3);
    for (const s of students) await registerForEvent(s, event.id, NOW);

    await expect(edit(event, { capacity: 2 })).rejects.toThrow(/3 seats are already taken/);
    await expect(edit(event, { capacity: 3 })).resolves.toEqual([]);
  });

  it("raising capacity promotes the waitlist and emails them", async () => {
    const event = await makeEvent({ capacity: 1 });
    const [a, b, c] = await makeStudents(3);
    await registerForEvent(a, event.id, NOW);
    await registerForEvent(b, event.id, NOW);
    await registerForEvent(c, event.id, NOW);

    const emails = await edit(event, { capacity: 2 });

    expect(emails.map((e) => e.to)).toEqual([b.email]);
    expect(await counts(event.id)).toEqual({ confirmed: 2, waitlisted: 1 });
  });

  it("removing the limit promotes everyone", async () => {
    const event = await makeEvent({ capacity: 1 });
    const [a, b, c] = await makeStudents(3);
    await registerForEvent(a, event.id, NOW);
    await registerForEvent(b, event.id, NOW);
    await registerForEvent(c, event.id, NOW);

    await edit(event, { capacity: null });

    expect(await counts(event.id)).toEqual({ confirmed: 3, waitlisted: 0 });
  });

  it("won't switch between solo and team once people have registered", async () => {
    const event = await makeEvent();
    const [a] = await makeStudents(1);
    await registerForEvent(a, event.id, NOW);
    await expect(edit(event, { participation: "TEAM", teamMin: 2, teamMax: 3 })).rejects.toThrow(
      /between solo and team/,
    );
  });

  it("won't change team sizes or seat rule once a team exists", async () => {
    const event = await makeEvent({ participation: "TEAM", teamMin: 2, teamMax: 3 });
    const [a] = await makeStudents(1);
    await createTeam(a, event.id, "Byte Club", NOW);

    await expect(edit(event, { teamMax: 5 })).rejects.toThrow(/Teams have already formed/);
    await expect(edit(event, { teamMin: 1 })).rejects.toThrow(/Teams have already formed/);
    await expect(edit(event, { seatPer: "MEMBER" })).rejects.toThrow(/Teams have already formed/);
  });

  it("counts seats by team when a team shares a seat", async () => {
    const event = await makeEvent({
      participation: "TEAM",
      teamMin: 2,
      teamMax: 2,
      capacity: 2,
      seatPer: "TEAM",
    });
    const [a, b] = await makeStudents(2);
    const { teamId } = await createTeam(a, event.id, "Byte Club", NOW);
    await inviteToTeam(a, teamId, b.rollNo!, NOW);
    await respondToInvite(b, teamId, true, NOW);

    // Two people, but one seat, so a limit of 1 is still fine.
    await expect(edit(event, { capacity: 1 })).resolves.toEqual([]);
  });

  it("cancelling emails everyone registered, waitlisted or on a team, once each", async () => {
    const solo = await makeEvent({ capacity: 1 });
    const [a, b, bystander] = await makeStudents(3);
    await registerForEvent(a, solo.id, NOW);
    await registerForEvent(b, solo.id, NOW);
    await registerForEvent(bystander, solo.id, NOW);
    await cancelRegistration(bystander, solo.id, NOW);

    const emails = await changeEventStatus({ id: adminId, role: "ADMIN" }, solo.id, "cancel", NOW);
    expect(emails.map((e) => e.to).sort()).toEqual([a.email, b.email].sort());
    expect(emails[0].subject).toMatch(/Cancelled/);

    const teamEvent = await makeEvent({ participation: "TEAM", teamMin: 3, teamMax: 3 });
    const [leader] = await makeStudents(1, "t");
    await createTeam(leader, teamEvent.id, "Forming", NOW);
    const teamEmails = await changeEventStatus(
      { id: adminId, role: "ADMIN" },
      teamEvent.id,
      "cancel",
      NOW,
    );
    expect(teamEmails.map((e) => e.to)).toEqual([leader.email]);
  });

  it("other status changes send no email, and a cancelled event takes no registrations", async () => {
    const event = await makeEvent();
    const [a, b] = await makeStudents(2);
    await registerForEvent(a, event.id, NOW);

    const actor = { id: adminId, role: "ADMIN" as const };
    expect(await changeEventStatus(actor, event.id, "close", NOW)).toEqual([]);
    await expect(registerForEvent(b, event.id, NOW)).rejects.toThrow(/closed/);

    await changeEventStatus(actor, event.id, "reopen", NOW);
    await changeEventStatus(actor, event.id, "cancel", NOW);
    await expect(registerForEvent(b, event.id, NOW)).rejects.toThrow(/cancelled/);
  });
});
