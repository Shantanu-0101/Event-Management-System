import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { parseRegistrationFilters } from "@/lib/registration-list";
import { prisma } from "@/lib/prisma";
import { newTicketCode } from "@/lib/tickets";
import { checkIn, CheckInError, getCheckInCounts, undoCheckIn } from "@/server/services/check-in";
import { changeEventStatus } from "@/server/services/events";
import { exportRegistrations, listRegistrations } from "@/server/services/registration-list";
import {
  cancelRegistration,
  createTeam,
  getTicket,
  inviteToTeam,
  registerForEvent,
  respondToInvite,
} from "@/server/services/registrations";
import { getCollegeReport } from "@/server/services/reports";
import { assertSafeTestDatabase } from "./test-database";

assertSafeTestDatabase(process.env.DATABASE_URL ?? "");

const NOW = new Date("2026-11-15T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
// While registration is open, and later once the event is on.
const DOORS_OPEN = new Date(NOW.getTime() + 5 * DAY);

let admin: { id: string; role: "ADMIN" };
let coordinator: { id: string; role: "COORDINATOR" };
let categoryId: string;
let departmentId: string;

async function wipe() {
  await prisma.auditLog.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.eventCoordinator.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.department.deleteMany();
}

beforeEach(async () => {
  await wipe();
  const [department, category, a, c] = await Promise.all([
    prisma.department.create({ data: { code: "CSE", name: "Computer Science" } }),
    prisma.category.create({ data: { name: "Hackathon", slug: "hackathon" } }),
    prisma.user.create({ data: { name: "Admin", email: "admin@test.local", role: "ADMIN" } }),
    prisma.user.create({
      data: { name: "Coordinator", email: "c@test.local", role: "COORDINATOR" },
    }),
  ]);
  departmentId = department.id;
  categoryId = category.id;
  admin = { id: a.id, role: "ADMIN" };
  coordinator = { id: c.id, role: "COORDINATOR" };
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
          departmentId,
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
    capacity?: number;
    title?: string;
    team?: boolean;
    startsAt?: Date;
    endsAt?: Date;
  } = {},
) {
  return prisma.event.create({
    data: {
      title: options.title ?? "Test event",
      slug: `test-${Math.random().toString(36).slice(2)}`,
      description: "<p>Test</p>",
      categoryId,
      createdById: admin.id,
      status: "PUBLISHED",
      regOpensAt: new Date(NOW.getTime() - DAY),
      regClosesAt: new Date(NOW.getTime() + DAY),
      startsAt: options.startsAt ?? new Date(NOW.getTime() + 5 * DAY),
      endsAt: options.endsAt ?? new Date(NOW.getTime() + 6 * DAY),
      capacity: options.capacity ?? null,
      participation: options.team ? "TEAM" : "SOLO",
      teamMin: options.team ? 2 : null,
      teamMax: options.team ? 3 : null,
      coordinators: { create: { userId: coordinator.id } },
    },
  });
}

const registrationOf = (eventId: string, userId: string) =>
  prisma.registration.findUniqueOrThrow({ where: { eventId_userId: { eventId, userId } } });

const refusal = async (attempt: Promise<unknown>) => {
  const error = await attempt.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CheckInError);
  return error as CheckInError;
};

describe("issuing tickets", () => {
  it("gives a confirmed student a ticket, and nobody on the waitlist one", async () => {
    const event = await makeEvent({ capacity: 1 });
    const [first, second] = await makeStudents(2);
    await registerForEvent(first, event.id, NOW);
    await registerForEvent(second, event.id, NOW);

    expect((await registrationOf(event.id, first.id)).ticketCode).toMatch(/^[0-9A-Z]{16}$/);
    expect((await registrationOf(event.id, second.id)).ticketCode).toBeNull();
  });

  it("gives a ticket when the waitlist moves, and takes it from the person who left", async () => {
    const event = await makeEvent({ capacity: 1 });
    const [first, second] = await makeStudents(2);
    await registerForEvent(first, event.id, NOW);
    await registerForEvent(second, event.id, NOW);

    await cancelRegistration(first, event.id, NOW);

    expect((await registrationOf(event.id, first.id)).ticketCode).toBeNull();
    expect((await registrationOf(event.id, second.id)).ticketCode).toMatch(/^[0-9A-Z]{16}$/);
  });

  it("issues a new code to someone who cancels and comes back, so the old one is dead", async () => {
    const event = await makeEvent();
    const [student] = await makeStudents(1);
    await registerForEvent(student, event.id, NOW);
    const old = (await registrationOf(event.id, student.id)).ticketCode!;

    await cancelRegistration(student, event.id, NOW);
    await registerForEvent(student, event.id, NOW);

    expect((await registrationOf(event.id, student.id)).ticketCode).not.toBe(old);
    const error = await refusal(checkIn(admin, event.id, { ticketCode: old }, DOORS_OPEN));
    expect(error.code).toBe("INVALID_TICKET");
  });

  it("gives every team member their own ticket", async () => {
    const event = await makeEvent({ team: true });
    const [leader, member] = await makeStudents(2);
    const { teamId } = await createTeam(leader, event.id, "Rockets", NOW);
    await inviteToTeam(leader, teamId, member.rollNo!, NOW);
    await respondToInvite(member, teamId, true, NOW);

    const leaderCode = (await registrationOf(event.id, leader.id)).ticketCode;
    const memberCode = (await registrationOf(event.id, member.id)).ticketCode;
    expect(leaderCode).toMatch(/^[0-9A-Z]{16}$/);
    expect(memberCode).toMatch(/^[0-9A-Z]{16}$/);
    expect(leaderCode).not.toBe(memberCode);
  });
});

describe("getTicket", () => {
  it("shows a student their own ticket and nobody else's", async () => {
    const event = await makeEvent();
    const [owner, other] = await makeStudents(2);
    await registerForEvent(owner, event.id, NOW);
    const { id } = await registrationOf(event.id, owner.id);

    expect((await getTicket(id, owner.id))?.ticketCode).toMatch(/^[0-9A-Z]{16}$/);
    expect(await getTicket(id, other.id)).toBeNull();
  });

  it("issues a ticket to someone confirmed before tickets existed", async () => {
    const event = await makeEvent();
    const [student] = await makeStudents(1);
    const { id } = await prisma.registration.create({
      data: { eventId: event.id, userId: student.id, status: "CONFIRMED" },
    });

    const code = (await getTicket(id, student.id))?.ticketCode;
    expect(code).toMatch(/^[0-9A-Z]{16}$/);
    // Asking again doesn't change it: a screenshot taken earlier must keep working.
    expect((await getTicket(id, student.id))?.ticketCode).toBe(code);
  });
});

describe("checkIn", () => {
  async function registered() {
    const event = await makeEvent();
    const [student] = await makeStudents(1);
    await registerForEvent(student, event.id, NOW);
    const registration = await registrationOf(event.id, student.id);
    return { event, student, registration, code: registration.ticketCode! };
  }

  it("marks attendance from a ticket, and says who it is", async () => {
    const { event, student, code } = await registered();

    const { person, counts } = await checkIn(
      coordinator,
      event.id,
      { ticketCode: code },
      DOORS_OPEN,
    );

    expect(person.name).toBe(student.name);
    expect(person.rollNo).toBe(student.rollNo);
    expect(person.department).toBe("CSE");
    expect(counts).toEqual({ registered: 1, checkedIn: 1 });

    const saved = await registrationOf(event.id, student.id);
    expect(saved.checkedInAt).toEqual(DOORS_OPEN);
    expect(saved.checkedInById).toBe(coordinator.id);
  });

  it("marks attendance from a search result, without a ticket", async () => {
    const { event, registration } = await registered();
    await checkIn(coordinator, event.id, { registrationId: registration.id }, DOORS_OPEN);
    expect(await getCheckInCounts(event.id)).toEqual({ registered: 1, checkedIn: 1 });
  });

  it("logs each check-in to the audit trail", async () => {
    const { event, registration, code } = await registered();
    await checkIn(coordinator, event.id, { ticketCode: code }, DOORS_OPEN);

    const logs = await prisma.auditLog.findMany({
      where: { action: "registration.checked_in", entityId: registration.id },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(coordinator.id);
  });

  it("refuses a second scan, and says who let them in and when", async () => {
    const { event, code } = await registered();
    await checkIn(coordinator, event.id, { ticketCode: code }, DOORS_OPEN);

    const later = new Date(DOORS_OPEN.getTime() + 60_000);
    const error = await refusal(checkIn(admin, event.id, { ticketCode: code }, later));

    expect(error.code).toBe("ALREADY_CHECKED_IN");
    expect(error.person?.checkedInBy).toBe("Coordinator");
    expect(error.person?.checkedInAt).toBe(DOORS_OPEN.toISOString());
    expect((await getCheckInCounts(event.id)).checkedIn).toBe(1);
  });

  it("lets exactly one through when ten phones scan one ticket at once", async () => {
    const { event, registration, code } = await registered();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        checkIn(coordinator, event.id, { ticketCode: code }, DOORS_OPEN),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") {
        expect((result.reason as CheckInError).code).toBe("ALREADY_CHECKED_IN");
      }
    }
    const logged = await prisma.auditLog.count({
      where: { action: "registration.checked_in", entityId: registration.id },
    });
    expect(logged).toBe(1);
  });

  it("refuses made-up codes, and a real code altered by one character", async () => {
    const { event, code } = await registered();
    const altered = (code[0] === "A" ? "B" : "A") + code.slice(1);

    for (const ticketCode of ["NOT-A-TICKET", altered, newTicketCode("other-secret")]) {
      const error = await refusal(checkIn(coordinator, event.id, { ticketCode }, DOORS_OPEN));
      expect(error.code).toBe("INVALID_TICKET");
    }
  });

  it("refuses a well-signed code that was never issued", async () => {
    const { event } = await registered();
    const error = await refusal(
      checkIn(coordinator, event.id, { ticketCode: newTicketCode() }, DOORS_OPEN),
    );
    expect(error.code).toBe("INVALID_TICKET");
  });

  it("names the right event when a ticket is for a different one", async () => {
    const { code } = await registered();
    const other = await makeEvent({ title: "Other event" });

    const error = await refusal(checkIn(admin, other.id, { ticketCode: code }, DOORS_OPEN));

    expect(error.code).toBe("WRONG_EVENT");
    expect(error.message).toContain("Test event");
    expect(error.person).toBeUndefined();
  });

  it("won't check in a registration from another event by its id", async () => {
    const { registration } = await registered();
    const other = await makeEvent({ title: "Other event" });
    const error = await refusal(
      checkIn(admin, other.id, { registrationId: registration.id }, DOORS_OPEN),
    );
    expect(error.code).toBe("INVALID_TICKET");
    expect(
      (await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).checkedInAt,
    ).toBeNull();
  });

  it("refuses someone on the waitlist", async () => {
    const event = await makeEvent({ capacity: 1 });
    const [first, second] = await makeStudents(2);
    await registerForEvent(first, event.id, NOW);
    await registerForEvent(second, event.id, NOW);
    const { id } = await registrationOf(event.id, second.id);

    const error = await refusal(checkIn(coordinator, event.id, { registrationId: id }, DOORS_OPEN));
    expect(error.code).toBe("NOT_CONFIRMED");
  });

  it("only lets the event's own coordinators and admins check in", async () => {
    const { event, code } = await registered();
    const outsider = await prisma.user.create({
      data: { name: "Other", email: "other@test.local", role: "COORDINATOR" },
    });

    const error = await refusal(
      checkIn({ id: outsider.id, role: "COORDINATOR" }, event.id, { ticketCode: code }, DOORS_OPEN),
    );
    expect(error.code).toBe("NOT_ALLOWED");

    await checkIn(admin, event.id, { ticketCode: code }, DOORS_OPEN);
  });

  it("is closed until a day before the event, and on a cancelled event", async () => {
    const { event, code } = await registered();

    const early = await refusal(checkIn(coordinator, event.id, { ticketCode: code }, NOW));
    expect(early.code).toBe("CHECK_IN_CLOSED");

    await changeEventStatus(admin, event.id, "cancel", NOW);
    const cancelled = await refusal(
      checkIn(coordinator, event.id, { ticketCode: code }, DOORS_OPEN),
    );
    expect(cancelled.code).toBe("CHECK_IN_CLOSED");
  });
});

describe("undoCheckIn", () => {
  it("takes it back, so the ticket can be scanned again, and logs it", async () => {
    const event = await makeEvent();
    const [student] = await makeStudents(1);
    await registerForEvent(student, event.id, NOW);
    const { id, ticketCode } = await registrationOf(event.id, student.id);
    await checkIn(coordinator, event.id, { ticketCode: ticketCode! }, DOORS_OPEN);

    const { counts } = await undoCheckIn(coordinator, event.id, id, DOORS_OPEN);

    expect(counts.checkedIn).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "registration.check_in_undone" } })).toBe(
      1,
    );
    await checkIn(coordinator, event.id, { ticketCode: ticketCode! }, DOORS_OPEN);
  });

  it("refuses someone who isn't checked in", async () => {
    const event = await makeEvent();
    const [student] = await makeStudents(1);
    await registerForEvent(student, event.id, NOW);
    const { id } = await registrationOf(event.id, student.id);

    const error = await refusal(undoCheckIn(coordinator, event.id, id, DOORS_OPEN));
    expect(error.code).toBe("NOT_CHECKED_IN");
  });
});

describe("cancelling after check-in", () => {
  it("clears attendance, so someone who registers again starts fresh", async () => {
    // Check-in opens a day before the start, and registration can still be open then.
    const start = new Date(NOW.getTime() + 2 * DAY);
    const event = await makeEvent({ startsAt: start, endsAt: new Date(start.getTime() + DAY) });
    const dayBefore = new Date(start.getTime() - DAY + 60_000);
    await prisma.event.update({
      where: { id: event.id },
      data: { regClosesAt: new Date(start.getTime() - 1000) },
    });
    const [student] = await makeStudents(1);
    await registerForEvent(student, event.id, NOW);
    const { ticketCode } = await registrationOf(event.id, student.id);
    await checkIn(coordinator, event.id, { ticketCode: ticketCode! }, dayBefore);

    await cancelRegistration(student, event.id, dayBefore);
    expect((await registrationOf(event.id, student.id)).checkedInAt).toBeNull();

    await registerForEvent(student, event.id, dayBefore);
    expect((await registrationOf(event.id, student.id)).checkedInAt).toBeNull();
    expect(await getCheckInCounts(event.id)).toEqual({ registered: 1, checkedIn: 0 });
  });
});

describe("the registrations table and exports", () => {
  it("filters by status, attendance and search, and numbers the waitlist from 1", async () => {
    const event = await makeEvent({ capacity: 2 });
    const students = await makeStudents(4);
    for (const s of students) await registerForEvent(s, event.id, NOW);
    const first = await registrationOf(event.id, students[0].id);
    await checkIn(coordinator, event.id, { ticketCode: first.ticketCode! }, DOORS_OPEN);

    const list = (params: Record<string, unknown>) =>
      listRegistrations(event.id, parseRegistrationFilters(params), 1);

    expect((await list({})).total).toBe(4);
    expect((await list({ status: "CONFIRMED" })).total).toBe(2);
    expect((await list({ attendance: "CHECKED_IN" })).rows.map((r) => r.name)).toEqual([
      students[0].name,
    ]);
    expect((await list({ q: students[1].rollNo })).rows.map((r) => r.name)).toEqual([
      students[1].name,
    ]);
    expect((await list({ status: "WAITLISTED" })).rows.map((r) => r.waitlistPlace)).toEqual([1, 2]);
  });

  it("writes each export to the audit log, with what was exported", async () => {
    const event = await makeEvent();
    const students = await makeStudents(3);
    for (const s of students) await registerForEvent(s, event.id, NOW);

    const rows = await exportRegistrations(
      coordinator.id,
      event.id,
      parseRegistrationFilters({ q: students[0].rollNo }),
      "csv",
    );

    expect(rows).toHaveLength(1);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "registrations.exported" },
    });
    expect(log.actorId).toBe(coordinator.id);
    expect(log.entityId).toBe(event.id);
    expect(log.meta).toMatchObject({ format: "csv", rows: 1 });
  });
});

describe("getCollegeReport", () => {
  it("counts running events only, by category and department", async () => {
    const running = await makeEvent();
    const cancelled = await makeEvent({ title: "Cancelled event" });
    const [a, b] = await makeStudents(2);
    await registerForEvent(a, running.id, NOW);
    await registerForEvent(b, running.id, NOW);
    await registerForEvent(a, cancelled.id, NOW);
    await changeEventStatus(admin, cancelled.id, "cancel", NOW);

    const report = await getCollegeReport(NOW);

    expect(report.events).toBe(1);
    expect(report.registrations).toBe(2);
    expect(report.students).toBe(2);
    expect(report.byCategory).toEqual([{ label: "Hackathon", registered: 2 }]);
    expect(report.byDepartment).toEqual([{ label: "Computer Science", registered: 2 }]);
    expect(report.topEvents.map((e) => e.id)).toEqual([running.id]);
  });

  it("works out attendance from finished events that actually took it", async () => {
    const took = await makeEvent({ title: "Took attendance" });
    const skipped = await makeEvent({ title: "Nobody scanned" });
    const notOver = await makeEvent({
      title: "Still running",
      endsAt: new Date(NOW.getTime() + 30 * DAY),
    });
    const students = await makeStudents(4);
    for (const s of students) {
      await registerForEvent(s, took.id, NOW);
      await registerForEvent(s, skipped.id, NOW);
      await registerForEvent(s, notOver.id, NOW);
    }
    for (const s of students.slice(0, 3)) {
      const { ticketCode } = await registrationOf(took.id, s.id);
      await checkIn(coordinator, took.id, { ticketCode: ticketCode! }, DOORS_OPEN);
      const running = await registrationOf(notOver.id, s.id);
      await checkIn(admin, notOver.id, { ticketCode: running.ticketCode! }, DOORS_OPEN);
    }

    const { attendance } = await getCollegeReport(new Date(NOW.getTime() + 10 * DAY));

    expect(attendance).toMatchObject({ registered: 4, checkedIn: 3, eventCount: 1 });
    expect(attendance.recent.map((e) => e.title)).toEqual(["Took attendance"]);
  });
});
