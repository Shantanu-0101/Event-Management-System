// Master data every environment needs: departments, categories, venues and
// the first admin. Safe to run more than once (every write is an upsert).
// Run with: npm run db:seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const departments = [
  { code: "CSE", name: "Computer Science and Engineering" },
  { code: "IT", name: "Information Technology" },
  { code: "AIDS", name: "Artificial Intelligence and Data Science" },
  { code: "ENTC", name: "Electronics and Telecommunication" },
  { code: "EE", name: "Electrical Engineering" },
  { code: "MECH", name: "Mechanical Engineering" },
  { code: "CIVIL", name: "Civil Engineering" },
];

// The five categories from the Flask prototype, now editable by admins.
const categories = [
  {
    slug: "sports",
    name: "Sports",
    icon: "trophy",
    description: "Indoor and outdoor games, from carrom and chess to cricket.",
  },
  {
    slug: "cultural",
    name: "Cultural",
    icon: "music",
    description: "Dance, music, drama and art competitions.",
  },
  {
    slug: "social",
    name: "Social",
    icon: "heart-handshake",
    description: "Drives, awareness campaigns and community service.",
  },
  {
    slug: "paper-presentation",
    name: "Paper Presentation",
    icon: "file-text",
    description: "Present your research or technical paper to a jury.",
  },
  {
    slug: "hackathon",
    name: "Hackathon",
    icon: "code",
    description: "Build something in a team against the clock.",
  },
];

// Placeholder venues; admins can rename or replace them from Phase 1.
const venues = [
  { name: "Main Auditorium", building: "Main Building", capacity: 500 },
  { name: "Seminar Hall", building: "Main Building", capacity: 150 },
  { name: "Computer Lab 1", building: "CSE Block", capacity: 60 },
  { name: "Sports Ground", building: "Campus", capacity: null },
  { name: "Indoor Sports Hall", building: "Gymkhana", capacity: 80 },
];

async function seedAdmin() {
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not set; skipping admin.");
    return;
  }
  if (password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 12 characters.");
  }

  // An existing admin keeps their current password; re-running the seed
  // never resets it.
  await prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN", isActive: true },
    create: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "ADMIN",
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`Admin ready: ${email}`);
}

async function main() {
  for (const d of departments) {
    await prisma.department.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: d,
    });
  }

  for (const [i, c] of categories.entries()) {
    const data = { ...c, sortOrder: i };
    await prisma.category.upsert({ where: { slug: c.slug }, update: data, create: data });
  }

  for (const v of venues) {
    await prisma.venue.upsert({ where: { name: v.name }, update: {}, create: v });
  }

  await seedAdmin();

  console.log(
    `Seeded ${departments.length} departments, ${categories.length} categories, ${venues.length} venues.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
