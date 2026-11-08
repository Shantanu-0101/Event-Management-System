import { expect, test } from "@playwright/test";
import { DEMO_EVENTS } from "../prisma/demo-data";
import {
  COORDINATOR,
  newStudentDetails,
  personFor,
  STUDENT,
  verifiedStudent,
} from "./support/actors";
import { copyEvent, sql } from "./support/db";

test("a seat freed by cancelling goes to the first person waiting", async ({
  page,
  browser,
  baseURL,
}) => {
  const event = await copyEvent(DEMO_EVENTS.webDesign, { capacity: 1 });

  await verifiedStudent(page);
  await page.goto(`/events/${event.slug}`);
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByText("You're registered.")).toBeVisible();

  const other = await (await browser.newContext({ baseURL })).newPage();
  await verifiedStudent(other);
  await other.goto(`/events/${event.slug}`);
  await other.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(other.getByText(/on the waitlist/i).first()).toBeVisible();

  await page.getByRole("button", { name: "Cancel registration" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel registration" }).click();
  await expect(page.getByRole("button", { name: "Join the waitlist" })).toBeVisible();

  await other.reload();
  await expect(other.getByText("You're registered.")).toBeVisible();
  await expect(other.getByRole("link", { name: "Show ticket" })).toBeVisible();
  await other.context().close();
});

test("a team registers when enough members accept", async ({ page, browser, baseURL }) => {
  const event = await copyEvent(DEMO_EVENTS.cricket);

  await verifiedStudent(page);
  await page.goto(`/events/${event.slug}`);
  await page.getByLabel("Team name").fill("Test Eleven");
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByText(/more members need to accept/)).toBeVisible();

  // The event needs three members, so two more people accept.
  for (const number of [1, 2]) {
    const member = newStudentDetails();
    const phone = await (await browser.newContext({ baseURL })).newPage();
    await verifiedStudent(phone, member);

    await page.getByLabel("Invite a teammate").fill(member.rollNo);
    await page.getByRole("button", { name: /Invite/i }).click();
    await expect(page.getByText(member.name)).toBeVisible();

    await phone.goto("/my-events");
    const invite = phone.getByRole("listitem").filter({ hasText: event.title });
    await expect(invite.getByText(/invited you to team Test Eleven/)).toBeVisible();
    await invite.getByRole("button", { name: "Accept" }).click();
    await expect(phone.getByRole("button", { name: "Accept" })).toBeHidden();

    if (number === 2) {
      await phone.goto(`/events/${event.slug}`);
      await expect(phone.getByText("You're registered.")).toBeVisible();
    }
    await phone.context().close();
  }

  await page.reload();
  await expect(page.getByText("You're registered.")).toBeVisible();
  const [row] = await sql<{ count: string }>(
    `SELECT COUNT(*) AS count FROM registrations WHERE event_id = $1 AND status = 'CONFIRMED'`,
    [event.id],
  );
  expect(Number(row.count)).toBe(3);
});

test("a disabled button says why", async ({ browser, baseURL }) => {
  const student = await personFor(browser, STUDENT, baseURL);

  await student.goto(`/events/${DEMO_EVENTS.expo}`); // Final-year CSE and IT only.
  await expect(student.getByRole("button", { name: "Register" })).toBeDisabled();
  await expect(student.locator("#registration-block")).toContainText(/year|department|open to/i);

  await student.goto(`/events/${DEMO_EVENTS.cleanUp}`); // Registration isn't open yet.
  await expect(student.getByRole("button", { name: "Register" })).toBeDisabled();
  await expect(student.locator("#registration-block")).toContainText(/opens/i);

  await student.context().close();
});

test("a full event offers the waitlist, and a cancelled one offers nothing", async ({ page }) => {
  await verifiedStudent(page);
  await page.goto(`/events/${DEMO_EVENTS.photography}`);
  await expect(page.getByRole("button", { name: "Join the waitlist" })).toBeEnabled();

  await page.goto(`/events/${DEMO_EVENTS.dance}`);
  await expect(page.getByText("Cancelled").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Register" })).toBeDisabled();
});

test("a coordinator's export holds the list, without ticket codes", async ({
  browser,
  baseURL,
}) => {
  const coordinator = await personFor(browser, COORDINATOR, baseURL);
  const [{ id }] = await sql<{ id: string }>("SELECT id FROM events WHERE slug = $1", [
    DEMO_EVENTS.robotics,
  ]);

  const csv = await coordinator.request.get(`/api/v1/events/${id}/registrations?format=csv`);
  expect(csv.ok()).toBe(true);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const text = await csv.text();
  expect(text.trim().split("\n").length).toBe(23); // A header and 22 people.
  const [{ ticket_code: ticket }] = await sql<{ ticket_code: string }>(
    `SELECT ticket_code FROM registrations WHERE event_id = $1 AND ticket_code IS NOT NULL LIMIT 1`,
    [id],
  );
  expect(text).not.toContain(ticket);

  const [logged] = await sql<{ count: string }>(
    `SELECT COUNT(*) AS count FROM audit_logs WHERE entity_id = $1 AND action LIKE '%export%'`,
    [id],
  );
  expect(Number(logged.count)).toBeGreaterThan(0);
  await coordinator.context().close();
});
