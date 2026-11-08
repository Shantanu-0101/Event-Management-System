import { expect, test } from "@playwright/test";
import { DEMO_EVENTS } from "../prisma/demo-data";
import { ADMIN, COORDINATOR, logIn, personFor, verifiedStudent } from "./support/actors";
import { copyEvent, sql } from "./support/db";

/** The value a datetime-local input takes, in India time. */
function inIndia(hoursFromNow: number) {
  const india = new Date(Date.now() + hoursFromNow * 3_600_000 + 5.5 * 3_600_000);
  return india.toISOString().slice(0, 16);
}

test("an admin creates an event, publishes it, and students can find it", async ({
  page,
  browser,
  baseURL,
}) => {
  const title = `E2E Event ${Date.now()}`;

  await logIn(page, ADMIN);
  await page.goto("/manage/events/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption({ label: "Sports" });
  await page.getByRole("textbox", { name: "Description" }).fill("A test of the whole form.");
  await page.getByLabel("Starts").fill(inIndia(72));
  await page.getByLabel("Ends").fill(inIndia(75));
  await page.getByLabel("Registration opens").fill(inIndia(-1));
  await page.getByLabel("Registration closes").fill(inIndia(48));
  await page.getByLabel("Seat limit").fill("20");
  await page
    .getByRole("button", { name: /Save|Create/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/manage\/events\/\w+\?saved=1/);

  // A draft isn't public yet.
  const visitor = await (await browser.newContext({ baseURL })).newPage();
  await visitor.goto(`/events?q=${encodeURIComponent(title)}`);
  await expect(visitor.getByRole("link", { name: title })).toBeHidden();

  await page.getByRole("button", { name: /Publish/ }).click();
  const dialog = page.getByRole("alertdialog");
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: /Publish/ }).click();
  }
  await expect(page).toHaveURL(/saved=publish/);

  await visitor.goto(`/events?q=${encodeURIComponent(title)}`);
  await visitor.getByRole("link", { name: title }).first().click();
  await expect(visitor.getByRole("heading", { name: title })).toBeVisible();
  await expect(visitor.getByRole("link", { name: /Log in/ }).first()).toBeVisible();
  await visitor.context().close();
});

test("rich text can't carry a script onto the public page", async ({ page, browser, baseURL }) => {
  const event = await copyEvent(DEMO_EVENTS.webDesign);
  await sql("UPDATE events SET description = $1 WHERE id = $2", ["<p>Safe</p>", event.id]);

  await logIn(page, ADMIN);
  await page.goto(`/manage/events/${event.id}`);
  const editor = page.getByRole("textbox", { name: "Description" });
  await editor.click();
  await page.keyboard.insertText(
    '<img src=x onerror="window.hacked=1"><script>window.hacked=1</script>',
  );
  await page.getByRole("button", { name: /Save/ }).first().click();
  await expect(page).toHaveURL(/saved=1/);

  const visitor = await (await browser.newContext({ baseURL })).newPage();
  await visitor.goto(`/events/${event.slug}`);
  expect(await visitor.evaluate(() => "hacked" in window)).toBe(false);
  await expect(visitor.locator(".rich-text img")).toHaveCount(0);
  await expect(visitor.locator(".rich-text script")).toHaveCount(0);
  await visitor.context().close();
});

test("an announcement reaches the bell of everyone registered", async ({
  page,
  browser,
  baseURL,
}) => {
  const event = await copyEvent(DEMO_EVENTS.carrom);

  await verifiedStudent(page);
  await page.goto(`/events/${event.slug}`);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText("You're registered.")).toBeVisible();

  const coordinator = await personFor(browser, COORDINATOR, baseURL);
  await coordinator.goto(`/manage/events/${event.id}/announcements`);
  await coordinator.getByLabel("Subject").fill("Moved to the main hall");
  await coordinator.getByLabel("Message").fill("Please come to the main hall instead.");
  await coordinator.getByRole("button", { name: /Send/ }).click();
  await expect(coordinator.getByText("Moved to the main hall").first()).toBeVisible();
  await coordinator.context().close();

  // deliver() runs just after the response, so give it a moment.
  await expect
    .poll(async () => {
      await page.goto("/");
      await page.getByRole("button", { name: /Notifications/ }).click();
      return page.getByText("Moved to the main hall").count();
    })
    .toBeGreaterThan(0);
});

test("a cancelled event tells everyone and kills its tickets", async ({
  page,
  browser,
  baseURL,
}) => {
  const event = await copyEvent(DEMO_EVENTS.carrom);

  await verifiedStudent(page);
  await page.goto(`/events/${event.slug}`);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText("You're registered.")).toBeVisible();

  const admin = await personFor(browser, ADMIN, baseURL);
  await admin.goto(`/manage/events/${event.id}`);
  await admin
    .getByRole("button", { name: /Cancel/ })
    .first()
    .click();
  await admin
    .getByRole("alertdialog")
    .getByRole("button", { name: /Cancel event|Yes|Cancel this/ })
    .click();
  await expect(admin).toHaveURL(/saved=cancel/);
  await admin.context().close();

  await page.goto(`/events/${event.slug}`);
  await expect(page.getByText("Cancelled").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Show ticket" })).toBeHidden();
});

test("the reports page shows the college's numbers", async ({ page }) => {
  await logIn(page, ADMIN);
  await page.goto("/manage/reports");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Computer Science and Engineering").first()).toBeVisible();
  await expect(page.getByText("Chess Championship").first()).toBeVisible();
  await expect(page.getByText(/attendance/i).first()).toBeVisible();
});

test("a bumped session version signs that person out everywhere", async ({ browser, baseURL }) => {
  const student = await personFor(browser, "student59@demo.campusevents.test", baseURL);
  await student.goto("/profile");
  await expect(student.getByLabel("Full name")).toBeVisible();

  await sql(`UPDATE users SET session_version = session_version + 1 WHERE email = $1`, [
    "student59@demo.campusevents.test",
  ]);
  await student.goto("/profile");
  await expect(student).toHaveURL(/\/login/);
  await student.context().close();
});
