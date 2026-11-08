import { expect, test } from "@playwright/test";
import { RATE_LIMITS } from "../src/lib/rate-limits";
import { logIn, newStudentDetails, signUp, STUDENT, verifiedStudent } from "./support/actors";
import { resetPasswordLink, sql } from "./support/db";

test("an unverified student can look around but is asked to verify before registering", async ({
  page,
}) => {
  await signUp(page, newStudentDetails());
  await expect(page.getByText(/verify your email/i).first()).toBeVisible();

  await page.goto("/events/carrom-tournament");
  await expect(page.getByRole("button", { name: "Register" })).toBeDisabled();
  await expect(page.locator("#registration-block")).toContainText(/verify/i);
});

test("a verified student loses the banner and can register", async ({ page }) => {
  await verifiedStudent(page);
  await page.goto("/events/carrom-tournament");
  await expect(page.getByRole("button", { name: "Register" })).toBeEnabled();
});

test("a wrong password gets one message, whether or not the account exists", async ({ page }) => {
  await page.goto("/login");
  for (const email of [STUDENT, "nobody-here@test.local"]) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Wrong email or password.")).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  }
});

// These use a second browser session rather than clearing cookies: a page prefetch still in
// flight would set the login cookie again, and the test would carry on signed in.
test("a forgotten password can be reset, and the link works only once", async ({
  page: signUpPage,
  browser,
  baseURL,
}) => {
  const student = newStudentDetails();
  await signUp(signUpPage, student);
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(student.email);
  await page.getByRole("button", { name: /reset|send/i }).click();
  await expect(page.getByText(/If that email has an account/)).toBeVisible();

  const link = await resetPasswordLink(student.email);
  const newPassword = "a-brand-new-password";
  await page.goto(link);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: /password/i }).click();
  await expect(page).toHaveURL(/\/login\?reset=1/);

  await logIn(page, student.email, newPassword);

  const later = await (await browser.newContext({ baseURL })).newPage();
  await later.goto(link);
  await expect(later.getByText("This link no longer works")).toBeVisible();
  await expect(later.getByLabel("New password")).toBeHidden();
});

test.describe("rate limits", () => {
  const { max } = RATE_LIMITS.loginAccount;

  test("repeated failures lock that login, and the right password doesn't get past it", async ({
    page: signUpPage,
    browser,
    baseURL,
  }) => {
    const student = newStudentDetails();
    await signUp(signUpPage, student);
    const page = await (await browser.newContext({ baseURL })).newPage();
    await page.goto("/login");

    for (let i = 0; i < max; i++) {
      await page.getByLabel("Email").fill(student.email);
      await page.getByLabel("Password", { exact: true }).fill(`wrong-${i}`);
      await page.getByRole("button", { name: "Log in" }).click();
      await expect(page.getByText("Wrong email or password.")).toBeVisible();
      // The message is still there from the last try, so wait for this try to finish.
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
    }

    await page.getByLabel("Email").fill(student.email);
    await page.getByLabel("Password", { exact: true }).fill(student.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText(/Too many attempts/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // One locked login doesn't stop other people on the same campus network.
    await logIn(page, STUDENT);
  });

  test("the login API behind the form has the same limit", async ({ request }) => {
    const email = `api-${Date.now()}@test.local`;
    const attempt = async () => {
      const { csrfToken } = await (await request.get("/api/auth/csrf")).json();
      const response = await request.post("/api/auth/callback/credentials", {
        form: { email, password: "wrong", csrfToken },
        maxRedirects: 0,
      });
      return response.headers().location ?? "";
    };
    for (let i = 0; i < max; i++) await attempt();
    expect(await attempt()).toContain("code=rate_limited");
  });

  test("the counters hold only hashes", async () => {
    const rows = await sql<{ key: string }>("SELECT key FROM rate_limits");
    expect(rows.length).toBeGreaterThan(0);
    for (const { key } of rows) expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});

test("security headers are on every response", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=(self)");
  expect(headers["x-powered-by"]).toBeUndefined();
});
