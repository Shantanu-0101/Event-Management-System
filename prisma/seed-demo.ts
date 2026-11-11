// Fills the database with the made-up demo college. Run with: npm run db:seed:demo
// Run `npm run db:seed` first. Running it again replaces the earlier demo data and moves
// all dates back to being relative to now, so do it shortly before a demo.
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { demoEmail, seedDemo } from "./demo-data";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const LOCAL_PASSWORD = "demo-password-2026";

/**
 * Anyone who has read this repo knows the default password, so it's only for a database
 * on this computer. Elsewhere the seed needs a clear go-ahead and a password of its own.
 */
function demoPassword(databaseUrl: string) {
  const isLocal = LOCAL_HOSTS.includes(new URL(databaseUrl).hostname);
  if (isLocal) return process.env.DEMO_PASSWORD || LOCAL_PASSWORD;

  if (process.env.ALLOW_DEMO_SEED !== "yes") {
    throw new Error(
      "This isn't a local database. To add demo accounts to it, set ALLOW_DEMO_SEED=yes.",
    );
  }
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("Set DEMO_PASSWORD to at least 12 characters for a non-local database.");
  }
  return password;
}

async function main() {
  const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  if (!process.env.AUTH_SECRET)
    throw new Error("AUTH_SECRET is not set; tickets are signed with it.");

  const password = demoPassword(databaseUrl);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
    // A far-away database (Neon from India) needs more than the 5 s default
    // for the clean-up transaction.
    transactionOptions: { maxWait: 20_000, timeout: 120_000 },
  });
  try {
    const counts = await seedDemo(prisma, {
      now: new Date(),
      passwordHash: await bcrypt.hash(password, 12),
    });
    console.log(
      `Demo college ready: ${counts.events} events, ${counts.students} students, ` +
        `${counts.coordinators} coordinators, ${counts.departments} departments.`,
    );
    console.log(`  Admin:       ${demoEmail("admin")}`);
    console.log(`  Coordinator: ${demoEmail("coordinator1")} (also coordinator2, coordinator3)`);
    console.log(`  Student:     ${demoEmail("student01")} (up to student60)`);
    console.log(
      password === LOCAL_PASSWORD
        ? `  Password:    ${LOCAL_PASSWORD}`
        : "  Password:    the DEMO_PASSWORD you set",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
