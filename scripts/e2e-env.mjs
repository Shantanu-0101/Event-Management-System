// The settings end-to-end tests run under. They get a database of their own on the local
// server, and never touch development data or anything remote.
import "dotenv/config";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const FALLBACK = "postgresql://eventapp:eventapp@localhost:5432/eventapp?schema=public";

export const E2E_PORT = 3100;

export function e2eDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL ?? FALLBACK);
  if (!LOCAL_HOSTS.includes(url.hostname)) {
    throw new Error(`End-to-end tests only run on a local database, not ${url.hostname}.`);
  }
  url.pathname = "/eventapp_e2e";
  return url.toString();
}

export function e2eEnv() {
  const databaseUrl = e2eDatabaseUrl();
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DIRECT_URL: databaseUrl,
    AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
    APP_URL: `http://localhost:${E2E_PORT}`,
    CRON_SECRET: "e2e-only-cron-secret",
    SEED_ADMIN_NAME: "E2E Admin",
    SEED_ADMIN_EMAIL: "e2e-admin@example.com",
    SEED_ADMIN_PASSWORD: "e2e-only-admin-password",
    // Nothing leaves this computer during a test run.
    RESEND_API_KEY: "",
    CLOUDINARY_URL: "",
    AUTH_GOOGLE_ID: "",
    AUTH_GOOGLE_SECRET: "",
  };
}
