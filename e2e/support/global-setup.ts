import { execSync } from "node:child_process";
import pg from "pg";
import { e2eDatabaseUrl, e2eEnv } from "../../scripts/e2e-env.mjs";

/** A fresh demo college before every run, so runs don't depend on each other. */
export default async function globalSetup() {
  execSync("npm run db:seed:demo", { env: e2eEnv(), stdio: "pipe" });

  const client = new pg.Client({ connectionString: e2eDatabaseUrl() });
  await client.connect();
  await client.query("DELETE FROM rate_limits");
  await client.end();
}
