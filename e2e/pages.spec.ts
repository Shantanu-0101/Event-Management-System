import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { DEMO_EVENTS } from "../prisma/demo-data";
import { ADMIN, COORDINATOR, logIn, STUDENT } from "./support/actors";
import { eventId } from "./support/db";

// Every page, on a desktop and a phone: WCAG 2.1 A and AA rules that a tool can check,
// no sideways scrolling, and no errors in the browser console.

async function checkPage(page: Page, path: string) {
  const problems: string[] = [];
  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === "error") problems.push(message.text());
  };
  const onError = (error: Error) => problems.push(error.message);
  page.on("console", onConsole);
  page.on("pageerror", onError);

  await page.goto(path);
  await page.waitForLoadState("networkidle");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const summary = violations.flatMap((v) =>
    v.nodes.map(
      (n) => `${v.id}: ${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim()}`,
    ),
  );
  expect(summary, `${path} accessibility`).toEqual([]);

  const headings = await page.locator("main h1:visible").count();
  expect(headings, `${path} should have one main heading`).toBe(1);

  // Dark mode has its own colours, so contrast is checked again there.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  const dark = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
  const darkSummary = dark.violations.flatMap((v) =>
    v.nodes.map((n) => `${n.target.join(" ")} — ${n.failureSummary?.split("\n")[1]?.trim()}`),
  );
  expect(darkSummary, `${path} dark mode contrast`).toEqual([]);
  await page.emulateMedia({ colorScheme: "light" });

  page.off("console", onConsole);
  page.off("pageerror", onError);
  // A camera refusal or a 404 on an unset photo isn't a fault in the page.
  const real = problems.filter((p) => !/camera|Permission|Failed to load resource/i.test(p));
  expect(real, `${path} console errors`).toEqual([]);
}

test.describe("signed out", () => {
  for (const path of [
    "/",
    "/events",
    `/events/${DEMO_EVENTS.chess}`,
    `/events/${DEMO_EVENTS.webDesign}`,
    "/login",
    "/signup",
    "/forgot-password",
    "/certificates/verify",
    "/no-such-page",
  ]) {
    test(path, ({ page }) => checkPage(page, path));
  }
});

test.describe("student", () => {
  test.beforeEach(({ page }) => logIn(page, STUDENT));

  for (const path of [
    "/my-events",
    "/profile",
    `/events/${DEMO_EVENTS.expo}`,
    `/events/${DEMO_EVENTS.cricket}`,
    `/events/${DEMO_EVENTS.papers}`,
  ]) {
    test(path, ({ page }) => checkPage(page, path));
  }
});

test.describe("coordinator", () => {
  test.beforeEach(({ page }) => logIn(page, COORDINATOR));

  test("/manage/events", ({ page }) => checkPage(page, "/manage/events"));
  test("/manage/check-in", ({ page }) => checkPage(page, "/manage/check-in"));

  test("the pages of one event", async ({ page }) => {
    const robotics = await eventId(DEMO_EVENTS.robotics);
    const chess = await eventId(DEMO_EVENTS.chess);
    await checkPage(page, `/manage/events/${robotics}`);
    await checkPage(page, `/manage/events/${robotics}/registrations`);
    await checkPage(page, `/manage/events/${robotics}/announcements`);
    await checkPage(page, `/manage/check-in/${robotics}`);
    await checkPage(page, `/manage/events/${chess}/results`);
  });
});

test.describe("admin", () => {
  test.beforeEach(({ page }) => logIn(page, ADMIN));

  for (const path of [
    "/manage/reports",
    "/manage/users",
    "/manage/departments",
    "/manage/categories",
    "/manage/venues",
    "/manage/events",
    "/manage/events/new",
  ]) {
    test(path, ({ page }) => checkPage(page, path));
  }
});

test("the keyboard reaches the skip link first, and it jumps past the header", async ({ page }) => {
  await page.goto("/events");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
});

test("people who ask for less motion get none", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const duration = await page.evaluate(() => getComputedStyle(document.body).animationDuration);
  expect(parseFloat(duration)).toBeLessThan(0.001);
  await context.close();
});
