import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// A safety net for "every route is role-checked". The end-to-end access tests prove the
// guards work; this fails the build when someone adds a new route without one.

const root = path.join(__dirname, "..", "..", "src");

function filesIn(dir: string, name: RegExp): string[] {
  return readdirSync(path.join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((file) => name.test(path.basename(file)))
    .map((file) => path.join(dir, file).replaceAll("\\", "/"));
}

const read = (file: string) => readFileSync(path.join(root, file), "utf8");

// Actions anyone may call: they're how people get an account in the first place.
const PUBLIC_ACTIONS = new Set([
  "loginAction",
  "googleSignInAction",
  "signupAction",
  "logoutAction",
  "forgotPasswordAction",
  "resetPasswordAction",
]);

const GUARD =
  /\b(requireRole|requireUser|requireEventStaff|getCurrentUser|admin|isCronAuthorized)\(/;

/** Each exported async function in a file, with the text of its body. */
function exportedFunctions(source: string) {
  const starts = [...source.matchAll(/^export (?:async )?function (\w+)/gm)];
  return starts.map((match, i) => ({
    name: match[1],
    body: source.slice(match.index, starts[i + 1]?.index ?? source.length),
  }));
}

describe("server actions", () => {
  const files = filesIn("server/actions", /\.ts$/);

  it("finds the action files", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files)("%s checks who is calling in every action", (file) => {
    for (const { name, body } of exportedFunctions(read(file))) {
      if (PUBLIC_ACTIONS.has(name)) continue;
      expect(GUARD.test(body), `${name} has no role check`).toBe(true);
    }
  });
});

describe("API routes", () => {
  // Public on purpose: Auth.js's own endpoints, which do their own checks.
  const files = filesIn("app/api", /^route\.ts$/).filter((f) => !f.includes("/auth/"));

  it("finds the routes", () => {
    expect(files.length).toBeGreaterThanOrEqual(8);
  });

  it.each(files)("%s checks who is calling in every method", (file) => {
    for (const { name, body } of exportedFunctions(read(file))) {
      expect(GUARD.test(body), `${name} has no role check`).toBe(true);
    }
  });
});

describe("protected pages", () => {
  const files = filesIn("app/(manage)", /^page\.tsx$/).concat(
    filesIn("app/(student)", /^page\.tsx$/),
  );

  it("finds the pages", () => {
    expect(files.length).toBeGreaterThanOrEqual(19);
  });

  it.each(files)("%s checks the user itself, not only in the proxy", (file) => {
    expect(GUARD.test(read(file))).toBe(true);
  });

  it("checks that a coordinator manages the event on every per-event page", () => {
    const perEvent = files.filter((f) => /\/(events|check-in)\/\[id\]/.test(f));
    expect(perEvent.length).toBeGreaterThanOrEqual(5);
    for (const file of perEvent) {
      expect(read(file), file).toContain("canManageEvent(me, event)");
    }
  });
});

describe("secrets", () => {
  it("keeps env files out of git", () => {
    const ignore = readFileSync(path.join(root, "..", ".gitignore"), "utf8");
    expect(ignore).toContain(".env*");
    expect(ignore).toContain("!.env.example");
  });

  it("has no real values in .env.example", () => {
    const example = readFileSync(path.join(root, "..", ".env.example"), "utf8");
    expect(example).toMatch(/^AUTH_SECRET=""$/m);
    for (const name of ["RESEND_API_KEY", "CLOUDINARY_URL", "CRON_SECRET", "AUTH_GOOGLE_SECRET"]) {
      expect(example, name).toMatch(new RegExp(`^# ${name}=""$`, "m"));
    }
  });
});
