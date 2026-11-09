import { PDFDocument } from "pdf-lib";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  countAudience,
  listAnnouncements,
  sendAnnouncement,
} from "@/server/services/announcements";
import {
  downloadAllCertificates,
  downloadCertificate,
  findCertificateByCode,
  generateCertificates,
  getCertificateCounts,
} from "@/server/services/certificates";
import { checkIn, undoCheckIn } from "@/server/services/check-in";
import { changeEventStatus, EventRuleError, updateEvent } from "@/server/services/events";
import { getFeedbackSummary, submitFeedback } from "@/server/services/feedback";
import {
  countUnread,
  deliver,
  listNotifications,
  markNotificationsRead,
} from "@/server/services/notifications";
import {
  cancelRegistration,
  createTeam,
  inviteToTeam,
  registerForEvent,
  respondToInvite,
} from "@/server/services/registrations";
import { sendDueReminders } from "@/server/services/reminders";
import { getPublicResults, getWinnerChoices, saveResults } from "@/server/services/results";
import { eventInputDefaults } from "./fixtures";
import { assertSafeTestDatabase } from "./test-database";

assertSafeTestDatabase(process.env.DATABASE_URL ?? "");

const NOW = new Date("2026-11-15T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const STARTS = new Date(NOW.getTime() + 5 * DAY);
const ENDS = new Date(NOW.getTime() + 6 * DAY);
const DOORS_OPEN = new Date(STARTS.getTime() + HOUR);
const AFTERWARDS = new Date(ENDS.getTime() + HOUR);

let admin: { id: string; role: "ADMIN" };
let coordinator: { id: string; role: "COORDINATOR" };
let otherCoordinator: { id: string; role: "COORDINATOR" };
let categoryId: string;
let departmentId: string;

async function wipe() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.result.deleteMany();
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
  const [department, category, a, c, other] = await Promise.all([
    prisma.department.create({ data: { code: "CSE", name: "Computer Science" } }),
    prisma.category.create({ data: { name: "Hackathon", slug: "hackathon" } }),
    prisma.user.create({ data: { name: "Admin", email: "admin@test.local", role: "ADMIN" } }),
    prisma.user.create({
      data: { name: "Coordinator", email: "c@test.local", role: "COORDINATOR" },
    }),
    prisma.user.create({
      data: { name: "Other", email: "other@test.local", role: "COORDINATOR" },
    }),
  ]);
  departmentId = department.id;
  categoryId = category.id;
  admin = { id: a.id, role: "ADMIN" };
  coordinator = { id: c.id, role: "COORDINATOR" };
  otherCoordinator = { id: other.id, role: "COORDINATOR" };
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

function makeEvent(options: { capacity?: number; team?: boolean; startsAt?: Date } = {}) {
  return prisma.event.create({
    data: {
      title: "Test event",
      slug: `test-${Math.random().toString(36).slice(2)}`,
      description: "<p>Test</p>",
      categoryId,
      createdById: admin.id,
      status: "PUBLISHED",
      regOpensAt: new Date(NOW.getTime() - DAY),
      regClosesAt: new Date(NOW.getTime() + DAY),
      startsAt: options.startsAt ?? STARTS,
      endsAt: new Date((options.startsAt ?? STARTS).getTime() + DAY),
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

/** Registers these students and checks them in. */
async function attend(eventId: string, students: Awaited<ReturnType<typeof makeStudents>>) {
  for (const s of students) await registerForEvent(s, eventId, NOW);
  for (const s of students) {
    const { id } = await registrationOf(eventId, s.id);
    await checkIn(coordinator, eventId, { registrationId: id }, DOORS_OPEN);
  }
}

const reg = async (eventId: string, userId: string) =>
  `reg:${(await registrationOf(eventId, userId)).id}`;

describe("registration emails", () => {
  it("sends a confirmed student their own ticket as a QR", async () => {
    const [a] = await makeStudents(1);
    const event = await makeEvent({ capacity: 1 });

    const { status, emails } = await registerForEvent(a!, event.id, NOW);
    const saved = await registrationOf(event.id, a!.id);

    expect(status).toBe("CONFIRMED");
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      to: a!.email,
      ticketCode: saved.ticketCode,
      notify: { userId: a!.id, link: `/my-events/${saved.id}/ticket` },
    });
  });

  it("tells a waitlisted student without a ticket, then sends one on promotion", async () => {
    const [a, b] = await makeStudents(2);
    const event = await makeEvent({ capacity: 1 });
    await registerForEvent(a!, event.id, NOW);

    const waiting = await registerForEvent(b!, event.id, NOW);
    expect(waiting.emails[0]!.ticketCode).toBeUndefined();
    expect(waiting.emails[0]!.subject).toMatch(/waitlist/);

    const { emails } = await cancelRegistration(a!, event.id, NOW);
    const promoted = await registrationOf(event.id, b!.id);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: b!.email, ticketCode: promoted.ticketCode });
    expect(promoted.ticketCode).not.toBeNull();
  });

  it("gives each team member their own ticket when the team confirms", async () => {
    const [leader, member] = await makeStudents(2);
    const event = await makeEvent({ team: true });

    const { teamId } = await createTeam(leader!, event.id, "Rockets", NOW);
    await inviteToTeam(leader!, teamId, member!.rollNo!, NOW);
    const { emails } = await respondToInvite(member!, teamId, true, NOW);

    const [first, second] = await Promise.all([
      registrationOf(event.id, leader!.id),
      registrationOf(event.id, member!.id),
    ]);
    const codes = Object.fromEntries(emails.map((e) => [e.to, e.ticketCode]));
    expect(codes).toEqual({
      [leader!.email]: first.ticketCode,
      [member!.email]: second.ticketCode,
    });
    expect(first.ticketCode).not.toBe(second.ticketCode);
  });
});

describe("event changed emails", () => {
  it("tells everyone when the time moves, and allows a new reminder", async () => {
    const students = await makeStudents(2);
    const event = await makeEvent();
    for (const s of students) await registerForEvent(s, event.id, NOW);
    await prisma.event.update({ where: { id: event.id }, data: { reminderSentAt: NOW } });

    const emails = await updateEvent(
      admin,
      event.id,
      eventInputDefaults(event, {
        startsAt: new Date(STARTS.getTime() + HOUR),
        coordinatorIds: [coordinator.id],
      }),
      NOW,
    );

    expect(emails.map((e) => e.to).sort()).toEqual(students.map((s) => s.email).sort());
    expect(emails[0]!.subject).toMatch(/Changed/);
    expect(emails[0]!.content.paragraphs[0]).toMatch(/time/);
    const saved = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(saved.reminderSentAt).toBeNull();
  });

  it("stays quiet when nothing people plan around changed", async () => {
    const [a] = await makeStudents(1);
    const event = await makeEvent();
    await registerForEvent(a!, event.id, NOW);
    await prisma.event.update({ where: { id: event.id }, data: { reminderSentAt: NOW } });

    const emails = await updateEvent(
      admin,
      event.id,
      eventInputDefaults(event, { description: "<p>New</p>", coordinatorIds: [coordinator.id] }),
      NOW,
    );

    expect(emails).toEqual([]);
    const saved = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });
    expect(saved.reminderSentAt).toEqual(NOW);
  });

  it("tells people an event is cancelled, on the bell too", async () => {
    const [a] = await makeStudents(1);
    const event = await makeEvent();
    await registerForEvent(a!, event.id, NOW);

    await deliver(await changeEventStatus(admin, event.id, "cancel", NOW));

    const { items } = await listNotifications(a!.id);
    expect(items[0]).toMatchObject({ link: `/events/${event.slug}` });
    expect(items[0]!.title).toMatch(/Cancelled/);
  });
});

describe("the notification bell", () => {
  it("counts, lists and marks only the person's own notifications", async () => {
    const [a, b] = await makeStudents(2);
    const event = await makeEvent();
    const first = await registerForEvent(a!, event.id, NOW);
    const second = await registerForEvent(b!, event.id, NOW);
    await deliver([...first.emails, ...second.emails]);

    expect(await countUnread(a!.id)).toBe(1);
    const { items } = await listNotifications(a!.id);
    const id = items[0]!.id;

    // Someone else's id does nothing.
    expect(await markNotificationsRead(b!.id, id, NOW)).toBe(1);
    expect(await countUnread(a!.id)).toBe(1);

    expect(await markNotificationsRead(a!.id, id, NOW)).toBe(0);
    expect(await markNotificationsRead(b!.id, null, NOW)).toBe(0);
  });

  it("leaves account emails off the bell", async () => {
    await deliver([
      {
        to: "x@test.local",
        subject: "Reset",
        content: { heading: "", greeting: "", paragraphs: [], footer: "" },
      },
    ]);
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("reminders", () => {
  it("reminds confirmed people once, for events inside the window", async () => {
    const [a, b, c] = await makeStudents(3);
    const soon = await makeEvent({ capacity: 2, startsAt: new Date(NOW.getTime() + 30 * HOUR) });
    const later = await makeEvent({ startsAt: new Date(NOW.getTime() + 40 * HOUR) });
    for (const s of [a!, b!, c!]) await registerForEvent(s, soon.id, NOW);
    await registerForEvent(a!, later.id, NOW);

    expect(await sendDueReminders(NOW)).toEqual({ events: 1, reminded: 2 });
    // c is waitlisted, and later is too far off.
    expect(await countUnread(a!.id)).toBe(1);
    expect(await countUnread(b!.id)).toBe(1);
    expect(await countUnread(c!.id)).toBe(0);

    expect(await sendDueReminders(new Date(NOW.getTime() + HOUR))).toEqual({
      events: 0,
      reminded: 0,
    });
    expect(await countUnread(a!.id)).toBe(1);
  });

  it("skips cancelled, draft and already started events", async () => {
    const [a] = await makeStudents(1);
    const soon = new Date(NOW.getTime() + 20 * HOUR);
    const cancelled = await makeEvent({ startsAt: soon });
    const draft = await makeEvent({ startsAt: soon });
    await registerForEvent(a!, cancelled.id, NOW);
    await prisma.event.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    await prisma.event.update({ where: { id: draft.id }, data: { status: "DRAFT" } });
    await makeEvent({ startsAt: new Date(NOW.getTime() - HOUR) });

    expect(await sendDueReminders(NOW)).toEqual({ events: 0, reminded: 0 });
  });
});

describe("announcements", () => {
  it("reaches everyone holding a place or on a forming team, and is kept as history", async () => {
    const [leader, waiting, cancelled] = await makeStudents(3);
    const solo = await makeEvent({ capacity: 1 });
    await registerForEvent(leader!, solo.id, NOW);
    await registerForEvent(waiting!, solo.id, NOW);
    await registerForEvent(cancelled!, solo.id, NOW);
    await cancelRegistration(cancelled!, solo.id, NOW);

    expect(await countAudience(solo.id)).toBe(2);
    const { recipients, emails } = await sendAnnouncement(coordinator, solo.id, {
      subject: "Room change",
      body: "Go to B12",
    });
    expect(recipients).toBe(2);
    expect(emails.map((e) => e.to).sort()).toEqual([leader!.email, waiting!.email].sort());
    expect(emails[0]!.subject).toContain("Room change");

    const [history] = await listAnnouncements(solo.id);
    expect(history).toMatchObject({ subject: "Room change", body: "Go to B12", recipients: 2 });
    expect(history!.sentBy).toBe("Coordinator");

    const team = await makeEvent({ team: true });
    await createTeam(leader!, team.id, "Solo so far", NOW);
    expect(await countAudience(team.id)).toBe(1);
  });

  it("refuses other coordinators, drafts and events with nobody on them", async () => {
    const event = await makeEvent();
    const input = { subject: "Hello", body: "There" };
    await expect(sendAnnouncement(otherCoordinator, event.id, input)).rejects.toThrow(/manage/);
    await expect(sendAnnouncement(coordinator, event.id, input)).rejects.toThrow(/Nobody/);

    await prisma.event.update({ where: { id: event.id }, data: { status: "DRAFT" } });
    await expect(sendAnnouncement(coordinator, event.id, input)).rejects.toThrow(/published/);
  });
});

describe("results", () => {
  it("only opens after the event, and only for its own staff", async () => {
    const event = await makeEvent();
    await expect(
      saveResults(coordinator, event.id, [null, null, null], DOORS_OPEN),
    ).rejects.toThrow(/ended/);
    await expect(
      saveResults(otherCoordinator, event.id, [null, null, null], AFTERWARDS),
    ).rejects.toThrow(/manage/);
  });

  it("only takes winners who were checked in, at this event", async () => {
    const [a, noShow, elsewhere] = await makeStudents(3);
    const event = await makeEvent();
    await attend(event.id, [a!]);
    await registerForEvent(noShow!, event.id, NOW);
    const other = await makeEvent();
    await attend(other.id, [elsewhere!]);

    expect((await getWinnerChoices(event.id)).map((c) => c.label)).toEqual([
      `${a!.name} (${a!.rollNo})`,
    ]);
    const attempt = async (id: string) =>
      saveResults(coordinator, event.id, [await reg(event.id, id), null, null], AFTERWARDS);
    await expect(attempt(noShow!.id)).rejects.toThrow(/checked in/);
    await expect(
      saveResults(
        coordinator,
        event.id,
        [await reg(other.id, elsewhere!.id), null, null],
        AFTERWARDS,
      ),
    ).rejects.toThrow(/checked in/);
  });

  it("shows on the event page, and tells only people whose place changed", async () => {
    const [a, b] = await makeStudents(2);
    const event = await makeEvent();
    await attend(event.id, [a!, b!]);
    const [ra, rb] = [await reg(event.id, a!.id), await reg(event.id, b!.id)];

    const first = await saveResults(coordinator, event.id, [ra, rb, null], AFTERWARDS);
    expect(first.emails.map((e) => e.to).sort()).toEqual([a!.email, b!.email].sort());
    expect(await getPublicResults(event.id)).toEqual([
      { place: "1st", winner: a!.name },
      { place: "2nd", winner: b!.name },
    ]);

    const same = await saveResults(coordinator, event.id, [ra, rb, null], AFTERWARDS);
    expect(same.emails).toEqual([]);

    const swapped = await saveResults(coordinator, event.id, [rb, null, null], AFTERWARDS);
    expect(swapped.emails.map((e) => e.to)).toEqual([b!.email]);
    expect(await getPublicResults(event.id)).toEqual([{ place: "1st", winner: b!.name }]);
  });

  it("refuses one winner in two places", async () => {
    const [a] = await makeStudents(1);
    const event = await makeEvent();
    await attend(event.id, [a!]);
    const ra = await reg(event.id, a!.id);
    await expect(saveResults(coordinator, event.id, [ra, ra, null], AFTERWARDS)).rejects.toThrow(
      /two places/,
    );
  });
});

describe("certificates", () => {
  it("every attendee gets a downloadable certificate whose code verifies", async () => {
    const [a, b, noShow] = await makeStudents(3);
    const event = await makeEvent();
    await attend(event.id, [a!, b!]);
    await registerForEvent(noShow!, event.id, NOW);
    await saveResults(coordinator, event.id, [await reg(event.id, a!.id), null, null], AFTERWARDS);

    const { issued, emails } = await generateCertificates(coordinator, event.id, AFTERWARDS);
    expect(issued).toBe(3); // a: participation and merit. b: participation.
    // One message each, even for the winner getting two certificates.
    expect(emails.map((e) => e.to).sort()).toEqual([a!.email, b!.email].sort());
    expect(emails.find((e) => e.to === a!.email)!.content.paragraphs[0]).toMatch(
      /participation certificate and merit certificate/,
    );

    const rows = await prisma.certificate.findMany({
      where: { registration: { userId: a!.id } },
      orderBy: { type: "asc" },
    });
    expect(rows.map((c) => c.type)).toEqual(["PARTICIPATION", "MERIT"]);

    const file = await downloadCertificate(rows[1]!.id, { id: a!.id, role: "STUDENT" });
    const doc = await PDFDocument.load(file!.bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(file!.filename).toMatch(/\.pdf$/);

    const verified = await findCertificateByCode(rows[1]!.verifyCode.toLowerCase());
    expect(verified).toMatchObject({ name: a!.name, type: "MERIT", place: "1st" });
    expect(verified).not.toHaveProperty("rollNo");
    expect(verified).not.toHaveProperty("email");

    const noShowRows = await prisma.certificate.count({
      where: { registration: { userId: noShow!.id } },
    });
    expect(noShowRows).toBe(0);
  });

  it("issues each one only once, even when two clicks arrive together", async () => {
    const students = await makeStudents(3);
    const event = await makeEvent();
    await attend(event.id, students);

    const both = await Promise.all([
      generateCertificates(coordinator, event.id, AFTERWARDS),
      generateCertificates(coordinator, event.id, AFTERWARDS),
    ]);
    expect(both.map((r) => r.issued).sort()).toEqual([0, 3]);
    expect(await prisma.certificate.count()).toBe(3);

    expect(await generateCertificates(coordinator, event.id, AFTERWARDS)).toEqual({
      issued: 0,
      emails: [],
    });
  });

  it("gives merit to winning team members who attended, not those who stayed away", async () => {
    const [leader, present, absent] = await makeStudents(3);
    const event = await makeEvent({ team: true });
    const { teamId } = await createTeam(leader!, event.id, "Rockets", NOW);
    for (const s of [present!, absent!]) {
      await inviteToTeam(leader!, teamId, s.rollNo!, NOW);
      await respondToInvite(s, teamId, true, NOW);
    }
    for (const s of [leader!, present!]) {
      const { id } = await registrationOf(event.id, s.id);
      await checkIn(coordinator, event.id, { registrationId: id }, DOORS_OPEN);
    }

    expect(await getWinnerChoices(event.id)).toEqual([
      { value: `team:${teamId}`, label: "Team Rockets" },
    ]);
    await saveResults(coordinator, event.id, [`team:${teamId}`, null, null], AFTERWARDS);
    const { issued } = await generateCertificates(coordinator, event.id, AFTERWARDS);

    expect(issued).toBe(4);
    const merit = await prisma.certificate.findMany({
      where: { type: "MERIT" },
      select: { registration: { select: { userId: true } } },
    });
    expect(merit.map((m) => m.registration.userId).sort()).toEqual(
      [leader!.id, present!.id].sort(),
    );
    const certificate = await prisma.certificate.findFirstOrThrow({
      where: { type: "MERIT", registration: { userId: present!.id } },
    });
    expect(await findCertificateByCode(certificate.verifyCode)).toMatchObject({
      team: "Rockets",
      place: "1st",
    });
  });

  it("withdraws a merit certificate when the winner changes", async () => {
    const [a, b] = await makeStudents(2);
    const event = await makeEvent();
    await attend(event.id, [a!, b!]);
    await saveResults(coordinator, event.id, [await reg(event.id, a!.id), null, null], AFTERWARDS);
    await generateCertificates(coordinator, event.id, AFTERWARDS);
    const merit = await prisma.certificate.findFirstOrThrow({ where: { type: "MERIT" } });

    await saveResults(coordinator, event.id, [await reg(event.id, b!.id), null, null], AFTERWARDS);

    expect(await findCertificateByCode(merit.verifyCode)).toBeNull();
    expect(await getCertificateCounts(event.id)).toEqual({ issued: 2, waiting: 1 });
  });

  it("withdraws certificates when a check-in is undone", async () => {
    const [a] = await makeStudents(1);
    const event = await makeEvent();
    await attend(event.id, [a!]);
    await generateCertificates(coordinator, event.id, AFTERWARDS);
    const { verifyCode } = await prisma.certificate.findFirstOrThrow();
    const { id } = await registrationOf(event.id, a!.id);

    await undoCheckIn(coordinator, event.id, id, AFTERWARDS);

    expect(await findCertificateByCode(verifyCode)).toBeNull();
  });

  it("guards who may issue and download", async () => {
    const [a, b] = await makeStudents(2);
    const event = await makeEvent();
    await attend(event.id, [a!]);

    await expect(generateCertificates(coordinator, event.id, DOORS_OPEN)).rejects.toThrow(/ended/);
    await expect(generateCertificates(otherCoordinator, event.id, AFTERWARDS)).rejects.toThrow(
      /manage/,
    );

    await generateCertificates(coordinator, event.id, AFTERWARDS);
    const { id } = await prisma.certificate.findFirstOrThrow();

    expect(await downloadCertificate(id, { id: b!.id, role: "STUDENT" })).toBeNull();
    expect(await downloadCertificate(id, otherCoordinator)).toBeNull();
    expect(await downloadCertificate(id, coordinator)).not.toBeNull();
    expect(await downloadCertificate(id, admin)).not.toBeNull();
  });

  it("bundles an event's certificates into one PDF, and logs it", async () => {
    const students = await makeStudents(3);
    const event = await makeEvent();
    await attend(event.id, students);
    expect(await downloadAllCertificates(coordinator, event)).toBeNull();

    await generateCertificates(coordinator, event.id, AFTERWARDS);
    const file = await downloadAllCertificates(coordinator, event);

    expect((await PDFDocument.load(file!.bytes)).getPageCount()).toBe(3);
    expect(
      await prisma.auditLog.count({
        where: { action: "certificates.exported", entityId: event.id, actorId: coordinator.id },
      }),
    ).toBe(1);
  });

  it("doesn't find a made-up code", async () => {
    expect(await findCertificateByCode("NOTAREALCODE")).toBeNull();
  });
});

describe("feedback", () => {
  it("lets an attendee rate once after the event, and shows staff the average", async () => {
    const [a, b] = await makeStudents(2);
    const event = await makeEvent();
    await attend(event.id, [a!, b!]);

    await submitFeedback(a!.id, event.id, { rating: 5, comment: "Great" }, AFTERWARDS);
    await submitFeedback(b!.id, event.id, { rating: 2 }, AFTERWARDS);

    const summary = await getFeedbackSummary(event.id);
    expect(summary.average).toBe(3.5);
    expect(summary.count).toBe(2);
    expect(summary.comments).toEqual([expect.objectContaining({ rating: 5, comment: "Great" })]);
    expect(summary.comments[0]).not.toHaveProperty("userId");
  });

  it("refuses a second rating, even sent at the same moment", async () => {
    const [a] = await makeStudents(1);
    const event = await makeEvent();
    await attend(event.id, [a!]);

    const results = await Promise.allSettled([
      submitFeedback(a!.id, event.id, { rating: 5 }, AFTERWARDS),
      submitFeedback(a!.id, event.id, { rating: 1 }, AFTERWARDS),
    ]);
    const refused = results.filter((r) => r.status === "rejected");
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(EventRuleError);
    expect(await prisma.feedback.count()).toBe(1);
  });

  it("refuses people who didn't attend, and anyone before it ends", async () => {
    const [a, noShow, stranger] = await makeStudents(3);
    const event = await makeEvent();
    await attend(event.id, [a!]);
    await registerForEvent(noShow!, event.id, NOW);

    const rate = (id: string, at: Date) => submitFeedback(id, event.id, { rating: 4 }, at);
    await expect(rate(a!.id, DOORS_OPEN)).rejects.toThrow(/ended/);
    await expect(rate(noShow!.id, AFTERWARDS)).rejects.toThrow(/attended/);
    await expect(rate(stranger!.id, AFTERWARDS)).rejects.toThrow(/attended/);
  });
});
