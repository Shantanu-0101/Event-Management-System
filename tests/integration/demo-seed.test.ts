import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_DOMAIN, DEMO_EVENTS, seedDemo } from "../../prisma/demo-data";
import { certificateKey, certificatesDue } from "@/lib/certificates";
import { effectiveStatus, seatsTaken } from "@/lib/events";
import { prisma } from "@/lib/prisma";
import { verifyTicketCode } from "@/lib/tickets";

const now = new Date();

async function seedMasterData() {
  await prisma.category.createMany({
    skipDuplicates: true,
    data: ["sports", "cultural", "social", "paper-presentation", "hackathon"].map((slug, i) => ({
      slug,
      name: `Demo test ${slug}`,
      sortOrder: i,
    })),
  });
  await prisma.venue.createMany({
    skipDuplicates: true,
    data: [
      "Indoor Sports Hall",
      "Computer Lab 1",
      "Main Auditorium",
      "Seminar Hall",
      "Sports Ground",
    ].map((name) => ({ name })),
  });
}

/** Leaves nothing behind, because the other test files empty these tables in their own order. */
async function wipe() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.feedback.deleteMany();
  await prisma.certificate.deleteMany();
  await prisma.result.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.eventEligibility.deleteMany();
  await prisma.eventCoordinator.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.department.deleteMany();
}

describe("demo seed", () => {
  let eventIds: string[];

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  beforeAll(async () => {
    await wipe();
    await seedMasterData();
    await seedDemo(prisma, { now, passwordHash: "not-a-real-hash" });
    // A second run must replace the first, not fail on or double its rows.
    await seedDemo(prisma, { now, passwordHash: "not-a-real-hash" });
    const events = await prisma.event.findMany({
      where: { createdBy: { email: { endsWith: `@${DEMO_DOMAIN}` } } },
      select: { id: true },
    });
    eventIds = events.map((e) => e.id);
  });

  it("creates the planned college", async () => {
    expect(eventIds).toHaveLength(15);
    const students = await prisma.user.findMany({
      where: { role: "STUDENT", email: { endsWith: `@${DEMO_DOMAIN}` } },
      select: { department: { select: { code: true } } },
    });
    expect(students).toHaveLength(60);
    expect(new Set(students.map((s) => s.department?.code))).toEqual(
      new Set(["CSE", "IT", "ENTC"]),
    );
    const categories = await prisma.event.groupBy({
      by: ["categoryId"],
      where: { id: { in: eventIds } },
    });
    expect(categories).toHaveLength(5);
  });

  it("puts each event in the state the demo script relies on", async () => {
    const statusOf = async (slug: string) => {
      const event = await prisma.event.findUniqueOrThrow({ where: { slug } });
      return effectiveStatus(event, now);
    };
    expect(await statusOf(DEMO_EVENTS.chess)).toBe("COMPLETED");
    expect(await statusOf(DEMO_EVENTS.robotics)).toBe("ONGOING");
    expect(await statusOf(DEMO_EVENTS.carrom)).toBe("PUBLISHED");
    expect(await statusOf(DEMO_EVENTS.alumni)).toBe("DRAFT");
    expect(await statusOf(DEMO_EVENTS.dance)).toBe("CANCELLED");
  });

  it("leaves student 1 able to show the feedback form on the paper presentation", async () => {
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: `student01@${DEMO_DOMAIN}` },
    });
    const event = await prisma.event.findUniqueOrThrow({ where: { slug: DEMO_EVENTS.papers } });
    const key = { eventId: event.id, userId: student.id };
    const registration = await prisma.registration.findUniqueOrThrow({
      where: { eventId_userId: key },
    });
    expect(registration.checkedInAt).not.toBeNull();
    expect(await prisma.feedback.findUnique({ where: { eventId_userId: key } })).toBeNull();
  });

  it("never oversells an event", async () => {
    const events = await prisma.event.findMany({
      where: { id: { in: eventIds }, capacity: { not: null } },
      include: { registrations: { where: { status: "CONFIRMED" } } },
    });
    for (const event of events) {
      const taken = seatsTaken({
        ...event,
        _count: {
          registrations: event.registrations.length,
          teams: new Set(event.registrations.map((r) => r.teamId)).size,
        },
      });
      expect(taken, event.title).toBeLessThanOrEqual(event.capacity!);
    }
  });

  it("leaves the seats the demo script needs", async () => {
    const webDesign = await prisma.event.findUniqueOrThrow({
      where: { slug: DEMO_EVENTS.webDesign },
      include: { registrations: true },
    });
    expect(webDesign.registrations).toHaveLength(webDesign.capacity! - 1);
  });

  it("gives a valid ticket to every confirmed person, and to nobody else", async () => {
    const registrations = await prisma.registration.findMany({
      where: { eventId: { in: eventIds } },
    });
    expect(registrations.length).toBeGreaterThan(100);
    for (const r of registrations) {
      if (r.status === "CONFIRMED") expect(verifyTicketCode(r.ticketCode!)).toBe(r.ticketCode);
      else expect(r.ticketCode).toBeNull();
      if (r.status === "WAITLISTED") expect(r.waitlistPosition).toBeGreaterThan(0);
      if (r.checkedInAt) expect(r.status).toBe("CONFIRMED");
    }
  });

  it("issues exactly the certificates that attendance and results earn", async () => {
    const finished = await prisma.event.findMany({
      where: { id: { in: eventIds }, status: "COMPLETED" },
      include: {
        results: true,
        registrations: { include: { certificates: true } },
      },
    });
    expect(finished).toHaveLength(5);
    for (const event of finished) {
      const attendees = event.registrations.filter((r) => r.checkedInAt);
      const expected = certificatesDue(attendees, event.results).map(certificateKey).sort();
      const issued = event.registrations
        .flatMap((r) => r.certificates)
        .map(certificateKey)
        .sort();
      expect(issued, event.title).toEqual(expected);
    }
  });

  it("only takes feedback from people who attended", async () => {
    const feedback = await prisma.feedback.findMany({
      where: { eventId: { in: eventIds } },
    });
    expect(feedback.length).toBeGreaterThan(0);
    for (const { eventId, userId } of feedback) {
      const registration = await prisma.registration.findUniqueOrThrow({
        where: { eventId_userId: { eventId, userId } },
      });
      expect(registration.checkedInAt).not.toBeNull();
    }
  });
});
