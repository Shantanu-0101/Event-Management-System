import { execSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { assertSafeTestDatabase, testDatabaseUrl } from "./test-database";

/** Creates the test database if it's missing and brings it up to the latest migration. */
export default async function setup() {
  const testUrl = testDatabaseUrl();
  assertSafeTestDatabase(testUrl);

  const name = new URL(testUrl).pathname.slice(1);
  const server = new URL(testUrl);
  server.pathname = "/postgres";

  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: server.toString() }),
  });
  try {
    const found = await admin.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_database WHERE datname = ${name}
    `;
    if (found.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.$disconnect();
  }

  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
  });
}
