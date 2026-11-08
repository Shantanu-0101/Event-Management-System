// Playwright starts this: a fresh database, a production build, then the real server. The
// tests see what visitors would see, not the development server's slower, looser behaviour.
import { execSync, spawn } from "node:child_process";
import net from "node:net";
import pg from "pg";
import { E2E_PORT, e2eDatabaseUrl, e2eEnv } from "./e2e-env.mjs";

const env = e2eEnv();
const run = (command) => execSync(command, { stdio: "inherit", env });

/** `next build` breaks a running `next dev`, because they share the .next folder. */
function isDevServerRunning() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "localhost", port: 3000, timeout: 500 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function recreateDatabase() {
  const url = new URL(e2eDatabaseUrl());
  const name = url.pathname.slice(1);
  url.pathname = "/postgres";
  url.search = "";
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${name}"`);
  await client.end();
}

if (await isDevServerRunning()) {
  console.error("Stop `npm run dev` first: a production build would break it.");
  process.exit(1);
}

await recreateDatabase();
run("npx prisma migrate deploy");
run("npm run db:seed");
if (!process.env.E2E_SKIP_BUILD) run("npx next build");

const server = spawn("npx", ["next", "start", "-p", String(E2E_PORT)], {
  env,
  stdio: "inherit",
  shell: true,
});
server.on("exit", (code) => process.exit(code ?? 0));
