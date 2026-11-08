// Everything a fresh clone needs, after `docker compose up -d`: dependencies, a .env with
// its own secrets, the tables, the master data and the demo college.
// Run with: npm run setup. Safe to run again; an existing .env is left as it is.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";

const run = (command) => execSync(command, { stdio: "inherit" });

function createEnvFile() {
  if (existsSync(".env")) {
    console.log("Keeping your existing .env.");
    return;
  }
  copyFileSync(".env.example", ".env");
  const secret = randomBytes(32).toString("base64url");
  const adminPassword = randomBytes(12).toString("base64url");
  const env = readFileSync(".env", "utf8")
    .replace('AUTH_SECRET=""', `AUTH_SECRET="${secret}"`)
    .replace(
      'SEED_ADMIN_PASSWORD="change-me-to-a-long-password"',
      `SEED_ADMIN_PASSWORD="${adminPassword}"`,
    );
  writeFileSync(".env", env);
  console.log("Created .env with a new AUTH_SECRET and admin password.");
}

function databaseAddress() {
  const line = readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m);
  const url = new URL(line?.[1] ?? "postgresql://localhost:5432/eventapp");
  return { host: url.hostname, port: Number(url.port || 5432) };
}

function canConnect({ host, port }) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 1000 });
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

async function waitForDatabase() {
  const address = databaseAddress();
  for (let attempt = 0; attempt < 30; attempt++) {
    if (await canConnect(address)) {
      // The port opens just before PostgreSQL is ready for its first query.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return;
    }
    if (attempt === 0)
      console.log(`Waiting for the database at ${address.host}:${address.port}...`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  console.error(
    "The database isn't reachable. Start Docker Desktop, run `docker compose up -d`, then try again.",
  );
  process.exit(1);
}

createEnvFile();
await waitForDatabase();
run("npm install");
run("npx prisma migrate deploy");
run("npm run db:seed");
run("npm run db:seed:demo");

console.log("\nAll set. Start the app with `npm run dev` and open http://localhost:3000");
console.log("The seed admin's email and password are in .env. Demo logins are listed above.");
