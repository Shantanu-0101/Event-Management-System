// The demo college: 3 departments, 60 students, 3 coordinators, an admin and 15 events
// in every state an event can be in. Everyone here is made up. All dates are relative to
// the moment it runs, so re-run it shortly before a demo.
//
// Rows are written directly because the services rightly refuse to register anyone for
// a finished event. tests/integration/demo-seed.test.ts checks that the result still
// follows the rules the services enforce.
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { EventStatus, Participation, SeatPer } from "../src/generated/prisma/enums";
import { certificatesDue } from "../src/lib/certificates";
import { eligibilityRows } from "../src/lib/events";
import { newTicketCode, newVerifyCode } from "../src/lib/tickets";

// Reserved for examples and tests by RFC 2606, so no real mailbox can ever receive these.
export const DEMO_DOMAIN = "demo.campusevents.test";
export const demoEmail = (name: string) => `${name}@${DEMO_DOMAIN}`;

// The slugs the demo script and the end-to-end tests rely on.
export const DEMO_EVENTS = {
  chess: "chess-championship",
  hackathon: "code-sprint-hackathon",
  cultural: "annual-cultural-night",
  bloodDrive: "blood-donation-drive",
  papers: "research-paper-presentation",
  robotics: "robotics-workshop",
  carrom: "carrom-tournament",
  cricket: "inter-department-cricket-cup",
  streetPlay: "street-play-competition",
  webDesign: "web-design-contest",
  photography: "photography-walk",
  expo: "final-year-project-expo",
  cleanUp: "campus-clean-up-drive",
  alumni: "alumni-career-talk",
  dance: "dance-battle",
} as const;

const DEPARTMENTS = [
  { code: "CSE", name: "Computer Science and Engineering" },
  { code: "IT", name: "Information Technology" },
  { code: "ENTC", name: "Electronics and Telecommunication" },
];

const FIRST_NAMES = [
  "Asha",
  "Rohan",
  "Priya",
  "Kunal",
  "Sneha",
  "Aditya",
  "Neha",
  "Vikram",
  "Pooja",
  "Sagar",
  "Isha",
  "Tejas",
  "Meera",
  "Omkar",
  "Riya",
  "Nikhil",
  "Anjali",
  "Harsh",
  "Kavya",
  "Yash",
];
const LAST_NAMES = ["Patil", "Kulkarni", "Deshmukh", "Joshi", "Shinde", "Pawar", "More", "Jadhav"];

const FEEDBACK = [
  { rating: 5, comment: "Very well organised. The QR check-in took seconds." },
  { rating: 5, comment: "Loved it. Please hold this every semester." },
  { rating: 4, comment: "Good event, though it started a little late." },
  { rating: 4, comment: null },
  { rating: 3, comment: "The venue was too small for the crowd." },
];

type Person = { id: string; departmentCode: string; year: number };

type EventPlan = {
  slug: string;
  title: string;
  categorySlug: string;
  venue?: string;
  subEvent?: string;
  summary: string;
  coordinator: number;
  capacity?: number;
  status?: EventStatus;
  participation?: Participation;
  team?: { min: number; max: number; seatPer: SeatPer };
  eligibility?: { departments: string[]; years: number[] };
  /** Hours from now. */
  starts: number;
  hours: number;
  regOpens: number;
  regCloses: number;
};

const DAY = 24;

// In the order they're shown in the spec's event life cycle: finished, running, upcoming.
const EVENTS: EventPlan[] = [
  {
    slug: DEMO_EVENTS.chess,
    title: "Chess Championship",
    categorySlug: "sports",
    venue: "Indoor Sports Hall",
    summary: "Rapid-format knockout across all years. Boards and clocks are provided.",
    coordinator: 0,
    capacity: 40,
    status: "COMPLETED",
    starts: -30 * DAY,
    hours: 6,
    regOpens: -45 * DAY,
    regCloses: -31 * DAY,
  },
  {
    slug: DEMO_EVENTS.hackathon,
    title: "Code Sprint Hackathon",
    categorySlug: "hackathon",
    venue: "Computer Lab 1",
    summary: "Twenty-four hours, one problem statement, teams of two to four.",
    coordinator: 1,
    capacity: 12,
    status: "COMPLETED",
    participation: "TEAM",
    team: { min: 2, max: 4, seatPer: "TEAM" },
    starts: -21 * DAY,
    hours: 24,
    regOpens: -40 * DAY,
    regCloses: -22 * DAY,
  },
  {
    slug: DEMO_EVENTS.cultural,
    title: "Annual Cultural Night",
    categorySlug: "cultural",
    venue: "Main Auditorium",
    subEvent: "Solo singing",
    summary: "An evening of music from every department, judged by the fine arts committee.",
    coordinator: 2,
    capacity: 200,
    status: "COMPLETED",
    starts: -14 * DAY,
    hours: 4,
    regOpens: -30 * DAY,
    regCloses: -15 * DAY,
  },
  {
    slug: DEMO_EVENTS.bloodDrive,
    title: "Blood Donation Drive",
    categorySlug: "social",
    venue: "Seminar Hall",
    summary: "Run with the district blood bank. Every unit is credited to the college.",
    coordinator: 2,
    status: "COMPLETED",
    starts: -10 * DAY,
    hours: 6,
    regOpens: -20 * DAY,
    regCloses: -11 * DAY,
  },
  {
    slug: DEMO_EVENTS.papers,
    title: "Research Paper Presentation",
    categorySlug: "paper-presentation",
    venue: "Seminar Hall",
    summary: "Ten minutes to present, five for questions from the jury.",
    coordinator: 1,
    capacity: 30,
    status: "COMPLETED",
    starts: -7 * DAY,
    hours: 5,
    regOpens: -21 * DAY,
    regCloses: -8 * DAY,
  },
  {
    slug: DEMO_EVENTS.robotics,
    title: "Robotics Workshop",
    categorySlug: "hackathon",
    venue: "Computer Lab 1",
    summary: "Build and program a line-following robot. Kits are shared in the lab.",
    coordinator: 0,
    capacity: 30,
    status: "ONGOING",
    starts: -1,
    hours: 6,
    regOpens: -10 * DAY,
    regCloses: -2,
  },
  {
    // Registration and check-in are both open, so one person can do both in the demo.
    slug: DEMO_EVENTS.carrom,
    title: "Carrom Tournament",
    categorySlug: "sports",
    venue: "Indoor Sports Hall",
    summary: "Singles knockout. Bring your ticket to the desk at the door.",
    coordinator: 0,
    capacity: 32,
    starts: 20,
    hours: 5,
    regOpens: -5 * DAY,
    regCloses: 18,
  },
  {
    slug: DEMO_EVENTS.cricket,
    title: "Inter-Department Cricket Cup",
    categorySlug: "sports",
    venue: "Sports Ground",
    summary: "Box cricket, eight overs a side. Each team needs three to five players.",
    coordinator: 0,
    capacity: 8,
    participation: "TEAM",
    team: { min: 3, max: 5, seatPer: "TEAM" },
    starts: 12 * DAY,
    hours: 8,
    regOpens: -3 * DAY,
    regCloses: 10 * DAY,
  },
  {
    slug: DEMO_EVENTS.streetPlay,
    title: "Street Play Competition",
    categorySlug: "cultural",
    venue: "Sports Ground",
    summary: "A ten-minute play on a social theme. Every member of a team takes a seat.",
    coordinator: 2,
    capacity: 30,
    participation: "TEAM",
    team: { min: 2, max: 6, seatPer: "MEMBER" },
    starts: 15 * DAY,
    hours: 3,
    regOpens: -2 * DAY,
    regCloses: 13 * DAY,
  },
  {
    // One seat left: the demo takes it, and the next person goes on the waitlist.
    slug: DEMO_EVENTS.webDesign,
    title: "Web Design Contest",
    categorySlug: "hackathon",
    venue: "Computer Lab 1",
    summary: "Design and build a landing page in three hours. No frameworks allowed.",
    coordinator: 1,
    capacity: 10,
    starts: 9 * DAY,
    hours: 3,
    regOpens: -4 * DAY,
    regCloses: 8 * DAY,
  },
  {
    slug: DEMO_EVENTS.photography,
    title: "Photography Walk",
    categorySlug: "cultural",
    summary: "A guided walk around campus at sunrise. Phones and cameras both welcome.",
    coordinator: 2,
    capacity: 5,
    starts: 6 * DAY,
    hours: 2,
    regOpens: -6 * DAY,
    regCloses: 5 * DAY,
  },
  {
    slug: DEMO_EVENTS.expo,
    title: "Final-Year Project Expo",
    categorySlug: "paper-presentation",
    venue: "Main Auditorium",
    summary: "Final-year CSE and IT students show their projects to visiting industry guests.",
    coordinator: 1,
    capacity: 50,
    eligibility: { departments: ["CSE", "IT"], years: [4] },
    starts: 20 * DAY,
    hours: 6,
    regOpens: -1 * DAY,
    regCloses: 18 * DAY,
  },
  {
    slug: DEMO_EVENTS.cleanUp,
    title: "Campus Clean-Up Drive",
    categorySlug: "social",
    summary: "Gloves and bags are provided. Registration opens in a few days.",
    coordinator: 2,
    starts: 18 * DAY,
    hours: 3,
    regOpens: 3 * DAY,
    regCloses: 16 * DAY,
  },
  {
    slug: DEMO_EVENTS.alumni,
    title: "Alumni Career Talk",
    categorySlug: "paper-presentation",
    venue: "Seminar Hall",
    summary: "Still being planned, so only staff can see this draft.",
    coordinator: 1,
    capacity: 100,
    status: "DRAFT",
    starts: 30 * DAY,
    hours: 2,
    regOpens: 5 * DAY,
    regCloses: 28 * DAY,
  },
  {
    slug: DEMO_EVENTS.dance,
    title: "Dance Battle",
    categorySlug: "cultural",
    venue: "Main Auditorium",
    summary: "Called off because the auditorium is being repaired.",
    coordinator: 2,
    capacity: 40,
    status: "CANCELLED",
    starts: 8 * DAY,
    hours: 3,
    regOpens: -8 * DAY,
    regCloses: 6 * DAY,
  },
];

/** Removes every trace of an earlier demo run, including what was done during a demo. */
async function removePreviousDemo(prisma: PrismaClient) {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const events = await prisma.event.findMany({
    where: { createdById: { in: userIds } },
    select: { id: true },
  });
  const eventIds = events.map((e) => e.id);
  const teams = await prisma.team.findMany({
    where: { OR: [{ eventId: { in: eventIds } }, { leaderId: { in: userIds } }] },
    select: { id: true },
  });
  const teamIds = teams.map((t) => t.id);
  const registrations = await prisma.registration.findMany({
    where: {
      OR: [{ eventId: { in: eventIds } }, { userId: { in: userIds } }, { teamId: { in: teamIds } }],
    },
    select: { id: true },
  });
  const registrationIds = registrations.map((r) => r.id);

  await prisma.$transaction([
    prisma.certificate.deleteMany({ where: { registrationId: { in: registrationIds } } }),
    prisma.result.deleteMany({
      where: {
        OR: [
          { eventId: { in: eventIds } },
          { registrationId: { in: registrationIds } },
          { teamId: { in: teamIds } },
        ],
      },
    }),
    prisma.feedback.deleteMany({
      where: { OR: [{ eventId: { in: eventIds } }, { userId: { in: userIds } }] },
    }),
    prisma.registration.updateMany({
      where: { checkedInById: { in: userIds } },
      data: { checkedInById: null },
    }),
    prisma.registration.deleteMany({ where: { id: { in: registrationIds } } }),
    prisma.teamMember.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.team.deleteMany({ where: { id: { in: teamIds } } }),
    prisma.eventCoordinator.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorId: { in: userIds } },
          { entity: "event", entityId: { in: eventIds } },
          { entity: "team", entityId: { in: teamIds } },
        ],
      },
    }),
    prisma.event.deleteMany({ where: { id: { in: eventIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
  ]);
}

function describe(plan: EventPlan) {
  return `<p>${plan.summary}</p><ul><li>Reach ten minutes before the start.</li><li>Carry your college ID and your ticket.</li></ul>`;
}

/** Creates the demo college. Safe to run again: it replaces the previous demo data. */
export async function seedDemo(
  prisma: PrismaClient,
  { now, passwordHash }: { now: Date; passwordHash: string },
) {
  const [categories, venues] = await Promise.all([
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.venue.findMany({ select: { id: true, name: true } }),
  ]);
  if (categories.length === 0 || venues.length === 0) {
    throw new Error("No categories or venues yet. Run `npm run db:seed` first.");
  }
  const categoryId = (slug: string) => {
    const found = categories.find((c) => c.slug === slug);
    if (!found) throw new Error(`The category "${slug}" is missing. Run \`npm run db:seed\`.`);
    return found.id;
  };
  const venueId = (name?: string) => venues.find((v) => v.name === name)?.id ?? null;

  await removePreviousDemo(prisma);

  const departmentIds = new Map<string, string>();
  for (const d of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { code: d.code },
      update: {},
      create: d,
    });
    departmentIds.set(d.code, row.id);
  }

  const verified = { passwordHash, emailVerifiedAt: now };
  const admin = await prisma.user.create({
    data: { ...verified, name: "Sunita Rao", email: demoEmail("admin"), role: "ADMIN" },
  });
  const coordinators = await Promise.all(
    [
      { n: 1, name: "Anil Bhosale", code: "CSE" },
      { n: 2, name: "Farah Shaikh", code: "IT" },
      { n: 3, name: "Manoj Gaikwad", code: "ENTC" },
    ].map(({ n, name, code }) =>
      prisma.user.create({
        data: {
          ...verified,
          name,
          email: demoEmail(`coordinator${n}`),
          role: "COORDINATOR",
          departmentId: departmentIds.get(code),
          phone: `98000000${String(n).padStart(2, "0")}`,
        },
      }),
    ),
  );

  // Twenty in each department, spread evenly across the four years.
  const students: Person[] = [];
  for (let i = 0; i < 60; i++) {
    const number = String(i + 1).padStart(2, "0");
    const departmentCode = DEPARTMENTS[i % DEPARTMENTS.length].code;
    // Student 1 is in third year, so the demo can show the final-year-only event refusing them.
    const year = i === 0 ? 3 : (i % 4) + 1;
    const student = await prisma.user.create({
      data: {
        ...verified,
        name: `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[i % LAST_NAMES.length]}`,
        email: demoEmail(`student${number}`),
        rollNo: `${departmentCode}26${number}`,
        departmentId: departmentIds.get(departmentCode),
        year,
        phone: `90000000${number}`,
      },
    });
    students.push({ id: student.id, departmentCode, year });
  }

  // Students 1 to 3 are kept free for the demo script's live steps.
  const pool = students.slice(3);
  const pick = (count: number, offset: number) =>
    Array.from({ length: count }, (_, i) => pool[(offset + i) % pool.length]);

  const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
  const created = new Map<string, Awaited<ReturnType<typeof prisma.event.create>>>();
  for (const plan of EVENTS) {
    const event = await prisma.event.create({
      data: {
        title: plan.title,
        slug: plan.slug,
        categoryId: categoryId(plan.categorySlug),
        subEvent: plan.subEvent ?? null,
        description: describe(plan),
        venueId: venueId(plan.venue),
        startsAt: hoursFromNow(plan.starts),
        endsAt: hoursFromNow(plan.starts + plan.hours),
        regOpensAt: hoursFromNow(plan.regOpens),
        regClosesAt: hoursFromNow(plan.regCloses),
        capacity: plan.capacity ?? null,
        participation: plan.participation ?? "SOLO",
        teamMin: plan.team?.min ?? null,
        teamMax: plan.team?.max ?? null,
        seatPer: plan.team?.seatPer ?? "TEAM",
        status: plan.status ?? "PUBLISHED",
        createdById: admin.id,
        coordinators: { create: { userId: coordinators[plan.coordinator].id } },
        eligibility: {
          create: plan.eligibility
            ? eligibilityRows(
                plan.eligibility.departments.map((code) => departmentIds.get(code)!),
                plan.eligibility.years,
              )
            : [],
        },
      },
    });
    created.set(plan.slug, event);
  }
  const eventOf = (slug: string) => created.get(slug)!;
  const coordinatorOf = (slug: string) =>
    coordinators[EVENTS.find((e) => e.slug === slug)!.coordinator].id;

  /** One confirmed row per person, with a real ticket. */
  async function confirm(slug: string, people: Person[], teamId: string | null = null) {
    return Promise.all(
      people.map((person) =>
        prisma.registration.create({
          data: {
            eventId: eventOf(slug).id,
            userId: person.id,
            teamId,
            status: "CONFIRMED",
            ticketCode: newTicketCode(),
          },
        }),
      ),
    );
  }

  async function createTeam(
    slug: string,
    name: string,
    people: Person[],
    confirmed: boolean,
    invited: Person[] = [],
  ) {
    const team = await prisma.team.create({
      data: {
        eventId: eventOf(slug).id,
        name,
        leaderId: people[0].id,
        inviteCode: randomBytes(9).toString("base64url"),
        members: {
          create: [
            ...people.map((p) => ({ userId: p.id, status: "ACCEPTED" as const })),
            ...invited.map((p) => ({ userId: p.id, status: "INVITED" as const })),
          ],
        },
      },
    });
    const registrations = confirmed ? await confirm(slug, people, team.id) : [];
    return { team, registrations };
  }

  /** Marks most of these people as having turned up, a few minutes after the start. */
  async function checkIn(
    slug: string,
    registrations: { id: string }[],
    keep: (index: number) => boolean,
  ) {
    const event = eventOf(slug);
    await Promise.all(
      registrations.flatMap((registration, i) =>
        keep(i)
          ? [
              prisma.registration.update({
                where: { id: registration.id },
                data: {
                  checkedInAt: new Date(event.startsAt.getTime() + ((i % 25) + 1) * 60_000),
                  checkedInById: coordinatorOf(slug),
                },
              }),
            ]
          : [],
      ),
    );
  }

  /** Enters the winners and issues what the attendance and results earn. */
  async function finish(
    slug: string,
    winners: { registrationId?: string; teamId?: string }[],
    giveFeedback: (index: number, userId: string) => boolean,
  ) {
    const eventId = eventOf(slug).id;
    await prisma.result.createMany({
      data: winners.map((winner, i) => ({
        eventId,
        position: i + 1,
        registrationId: winner.registrationId ?? null,
        teamId: winner.teamId ?? null,
      })),
    });

    const attendees = await prisma.registration.findMany({
      where: { eventId, status: "CONFIRMED", checkedInAt: { not: null } },
      select: { id: true, teamId: true, userId: true },
      orderBy: { createdAt: "asc" },
    });
    const results = await prisma.result.findMany({
      where: { eventId },
      select: { position: true, registrationId: true, teamId: true },
    });
    await prisma.certificate.createMany({
      data: certificatesDue(attendees, results).map((due) => ({
        ...due,
        verifyCode: newVerifyCode(),
        issuedAt: eventOf(slug).endsAt,
      })),
    });
    await prisma.feedback.createMany({
      data: attendees.flatMap((attendee, i) =>
        giveFeedback(i, attendee.userId)
          ? [{ eventId, userId: attendee.userId, ...FEEDBACK[i % FEEDBACK.length] }]
          : [],
      ),
    });
  }

  // ─── Finished events ──────────────────────────────────────────────────────

  // Student 1 won the chess, and has a certificate and a results entry to show.
  const chess = await confirm(DEMO_EVENTS.chess, [students[0], ...pick(23, 0)]);
  await checkIn(DEMO_EVENTS.chess, chess, (i) => i % 5 !== 4);
  await finish(
    DEMO_EVENTS.chess,
    [
      { registrationId: chess[0].id },
      { registrationId: chess[1].id },
      { registrationId: chess[2].id },
    ],
    (i) => i % 2 === 0,
  );

  const hackathonTeams = await Promise.all(
    [
      { name: "Null Pointers", offset: 10 },
      { name: "Merge Conflict", offset: 14 },
      { name: "Stack Overflowers", offset: 18 },
      { name: "Byte Me", offset: 22 },
      { name: "Runtime Terror", offset: 26 },
    ].map(({ name, offset }) => createTeam(DEMO_EVENTS.hackathon, name, pick(4, offset), true)),
  );
  await checkIn(
    DEMO_EVENTS.hackathon,
    hackathonTeams.flatMap((t) => t.registrations),
    (i) => i !== 7,
  );
  await finish(
    DEMO_EVENTS.hackathon,
    hackathonTeams.slice(0, 3).map(({ team }) => ({ teamId: team.id })),
    (i) => i % 3 === 0,
  );

  const cultural = await confirm(DEMO_EVENTS.cultural, [students[0], ...pick(35, 12)]);
  await checkIn(DEMO_EVENTS.cultural, cultural, (i) => i % 4 !== 3);
  await finish(
    DEMO_EVENTS.cultural,
    [{ registrationId: cultural[1].id }, { registrationId: cultural[2].id }],
    (i) => i % 2 === 1,
  );

  // Nobody wins a blood drive: this one has attendance and certificates, but no results.
  const bloodDrive = await confirm(DEMO_EVENTS.bloodDrive, pick(28, 20));
  await checkIn(DEMO_EVENTS.bloodDrive, bloodDrive, (i) => i % 6 !== 5);
  await finish(DEMO_EVENTS.bloodDrive, [], (i) => i % 4 === 0);

  // Student 1 attended this one but hasn't left feedback, so the demo can show the form.
  const papers = await confirm(DEMO_EVENTS.papers, [...pick(18, 30), students[0]]);
  await checkIn(DEMO_EVENTS.papers, papers, (i) => i % 7 !== 6);
  await finish(
    DEMO_EVENTS.papers,
    [{ registrationId: papers[0].id }, { registrationId: papers[1].id }],
    (i, userId) => i % 2 === 0 && userId !== students[0].id,
  );

  // ─── Running now ──────────────────────────────────────────────────────────

  const robotics = await confirm(DEMO_EVENTS.robotics, pick(22, 5));
  await checkIn(DEMO_EVENTS.robotics, robotics, (i) => i < 9);
  await prisma.auditLog.create({
    data: {
      actorId: coordinators[0].id,
      action: "event.announced",
      entity: "event",
      entityId: eventOf(DEMO_EVENTS.robotics).id,
      meta: {
        subject: "Lab change",
        body: "We've moved to Computer Lab 1 on the ground floor. Please bring your ticket.",
        recipients: robotics.length,
      },
      createdAt: hoursFromNow(-3),
    },
  });

  await confirm(DEMO_EVENTS.carrom, pick(14, 40));

  // ─── Upcoming ─────────────────────────────────────────────────────────────

  await createTeam(DEMO_EVENTS.cricket, "CSE Strikers", pick(4, 3), true);
  await createTeam(DEMO_EVENTS.cricket, "IT Titans", pick(3, 7), true);
  // Still forming: one short of the minimum, so it holds no seat yet.
  await createTeam(DEMO_EVENTS.cricket, "ENTC Spartans", pick(1, 10), false, pick(1, 11));

  await createTeam(DEMO_EVENTS.streetPlay, "Nukkad", pick(6, 15), true);
  await createTeam(DEMO_EVENTS.streetPlay, "Aawaaz", pick(5, 21), true);

  await confirm(DEMO_EVENTS.webDesign, pick(9, 28)); // One seat left.

  await confirm(DEMO_EVENTS.photography, pick(5, 2)); // Full.
  await Promise.all(
    pick(3, 7).map((person, i) =>
      prisma.registration.create({
        data: {
          eventId: eventOf(DEMO_EVENTS.photography).id,
          userId: person.id,
          status: "WAITLISTED",
          waitlistPosition: i + 1,
        },
      }),
    ),
  );

  await confirm(
    DEMO_EVENTS.expo,
    pool.filter((s) => s.year === 4 && s.departmentCode !== "ENTC").slice(0, 8),
  );

  // A cancelled event keeps its registrations as cancelled, with no live tickets.
  await Promise.all(
    pick(6, 33).map((person) =>
      prisma.registration.create({
        data: {
          eventId: eventOf(DEMO_EVENTS.dance).id,
          userId: person.id,
          status: "CANCELLED",
        },
      }),
    ),
  );

  // Something waiting on student 1's bell.
  await prisma.notification.createMany({
    data: [
      {
        userId: students[0].id,
        title: "Your certificates are ready",
        body: "Chess Championship: download them from My events.",
        link: "/my-events",
        createdAt: hoursFromNow(-30 * DAY + 8),
      },
      {
        userId: students[0].id,
        title: "How was Research Paper Presentation?",
        body: "Tell the organisers what you thought. It takes a minute.",
        link: `/events/${DEMO_EVENTS.papers}`,
        createdAt: hoursFromNow(-7 * DAY + 6),
      },
    ],
  });

  return {
    departments: DEPARTMENTS.length,
    students: students.length,
    coordinators: coordinators.length,
    events: created.size,
  };
}
