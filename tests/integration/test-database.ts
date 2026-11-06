import "dotenv/config";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const FALLBACK = "postgresql://eventapp:eventapp@localhost:5432/eventapp?schema=public";

/** The same server as DATABASE_URL, but a database of its own: "eventapp" → "eventapp_test". */
export function testDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL ?? FALLBACK);
  if (!url.pathname.endsWith("_test")) url.pathname = `${url.pathname}_test`;
  return url.toString();
}

/**
 * These tests create and delete rows freely, so they must never reach a real
 * database. Even if DATABASE_URL points at Neon, they refuse to run.
 */
export function assertSafeTestDatabase(databaseUrl: string) {
  const url = new URL(databaseUrl);
  if (!LOCAL_HOSTS.includes(url.hostname) || !url.pathname.endsWith("_test")) {
    throw new Error(
      `Integration tests only run on a local *_test database, not ${url.hostname}${url.pathname}.`,
    );
  }
}
