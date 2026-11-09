import { expect, test } from "@playwright/test";
import { demoEmail, DEMO_EVENTS } from "../prisma/demo-data";
import { ADMIN, COORDINATOR, personFor, STUDENT } from "./support/actors";
import { eventId, sql, ticketCode } from "./support/db";

// docs/DEMO.md, step by step, on freshly seeded data. If this passes, the demo runs start
// to end. It can't cover the real camera or a real email, which need a phone and a key.
// The steps share data on purpose, in the order they're presented.

test("the demo script runs from start to end", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);

  const student1 = await personFor(browser, STUDENT, baseURL);
  const student2 = await personFor(browser, demoEmail("student02"), baseURL);
  const coordinator = await personFor(browser, COORDINATOR, baseURL);
  const admin = await personFor(browser, ADMIN, baseURL);

  await test.step("1. A visitor finds events", async () => {
    await page.goto("/events");
    await page
      .getByLabel(/search/i)
      .first()
      .fill("carrom");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=carrom/);
    await expect(page.getByRole("link", { name: /Carrom Tournament/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Chess Championship/ })).toBeHidden();

    await page.goto(`/events/${DEMO_EVENTS.expo}`);
    await expect(page.getByRole("heading", { name: "Final-Year Project Expo" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Log in/ }).first()).toBeVisible();
  });

  await test.step("2. Rules are explained on a disabled button", async () => {
    await student1.goto(`/events/${DEMO_EVENTS.expo}`);
    await expect(student1.getByRole("button", { name: "Register" })).toBeDisabled();
    await expect(student1.locator("#registration-block")).toBeVisible();

    await student1.goto(`/events/${DEMO_EVENTS.cleanUp}`);
    await expect(student1.getByRole("button", { name: "Register" })).toBeDisabled();
    await expect(student1.locator("#registration-block")).toContainText(/opens/i);
  });

  await test.step("3. The last seat, the waitlist and promotion", async () => {
    await student1.goto(`/events/${DEMO_EVENTS.webDesign}`);
    await expect(student1.getByText("1 of 10 seats left")).toBeVisible();
    await student1.getByRole("button", { name: "Register" }).click();
    await expect(student1.getByText("You're registered.")).toBeVisible();

    await student2.goto(`/events/${DEMO_EVENTS.webDesign}`);
    await student2.getByRole("button", { name: "Join the waitlist" }).click();
    await expect(student2.getByText(/waitlist/i).first()).toBeVisible();
    await expect(student2.getByRole("button", { name: "Leave waitlist" })).toBeVisible();

    await student1.getByRole("button", { name: "Cancel registration" }).click();
    await student1
      .getByRole("alertdialog")
      .getByRole("button", { name: "Cancel registration" })
      .click();
    await expect(student1.getByRole("button", { name: "Join the waitlist" })).toBeVisible();

    await student2.reload();
    await expect(student2.getByText("You're registered.")).toBeVisible();
    await expect(student2.getByRole("link", { name: "Show ticket" })).toBeVisible();
  });

  await test.step("4. Ticket and check-in, with a second scan refused", async () => {
    await student1.goto(`/events/${DEMO_EVENTS.carrom}`);
    await student1.getByRole("button", { name: "Register" }).click();
    await student1.getByRole("link", { name: "Show ticket" }).click();
    await expect(student1.getByRole("img", { name: /QR/i })).toBeVisible();

    const code = await ticketCode(STUDENT, DEMO_EVENTS.carrom);
    await coordinator.goto("/manage/check-in");
    await coordinator
      .getByRole("link", { name: /Carrom Tournament/ })
      .first()
      .click();
    await expect(coordinator.getByTestId("checked-in-count")).toHaveText("0");

    const search = coordinator.getByLabel(/Can't scan\?/);
    await search.fill(code);
    await coordinator.getByRole("button", { name: "Find" }).click();
    await expect(coordinator.getByRole("status").getByText("Checked in")).toBeVisible();
    await expect(coordinator.getByTestId("checked-in-count")).toHaveText("1");

    await search.fill(code);
    await coordinator.getByRole("button", { name: "Find" }).click();
    await expect(coordinator.getByRole("status").getByText(/Already checked in/)).toBeVisible();
  });

  await test.step("5. A team starts forming", async () => {
    const student3 = await personFor(browser, demoEmail("student03"), baseURL);
    await student3.goto(`/events/${DEMO_EVENTS.cricket}`);
    await student3.getByLabel("Team name").fill("Demo Eleven");
    await student3.getByRole("button", { name: "Create team" }).click();
    await expect(student3.getByText(/2 more members need to accept/)).toBeVisible();
    await student3.context().close();
  });

  await test.step("6. During an event: registrations, export and announcement", async () => {
    const robotics = await eventId(DEMO_EVENTS.robotics);
    await coordinator.goto(`/manage/events/${robotics}/registrations`);
    await expect(coordinator.getByRole("heading", { name: "Robotics Workshop" })).toBeVisible();
    await expect(coordinator.getByRole("link", { name: /CSV/ })).toBeVisible();
    const csv = await coordinator.request.get(
      `/api/v1/events/${robotics}/registrations?format=csv`,
    );
    expect(csv.ok()).toBe(true);

    await coordinator.goto(`/manage/events/${robotics}/announcements`);
    await expect(coordinator.getByText("Lab change")).toBeVisible();
    await coordinator.getByLabel("Subject").fill("Lunch at one");
    await coordinator.getByLabel("Message").fill("Lunch is at one o'clock in the canteen.");
    await coordinator.getByRole("button", { name: /Send/ }).click();
    await expect(coordinator.getByText("Lunch at one").first()).toBeVisible();
  });

  await test.step("7. After an event: results, certificate, verify and feedback", async () => {
    const chess = await eventId(DEMO_EVENTS.chess);
    await coordinator.goto(`/manage/events/${chess}/results`);
    await expect(coordinator.getByRole("heading", { name: "Results" })).toBeVisible();
    await expect(coordinator.getByRole("heading", { name: "Feedback" })).toBeVisible();

    await student1.goto("/my-events");
    const row = student1.getByRole("listitem").filter({ hasText: "Chess Championship" });
    const merit = row.getByRole("link", { name: "Merit certificate" });
    await expect(merit).toBeVisible();
    const pdf = await student1.request.get((await merit.getAttribute("href"))!);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const [certificate] = await sql<{ verify_code: string }>(
      `SELECT c.verify_code FROM certificates c
       JOIN registrations r ON r.id = c.registration_id
       JOIN users u ON u.id = r.user_id JOIN events e ON e.id = r.event_id
       WHERE u.email = $1 AND e.slug = $2 AND c.type = 'MERIT'`,
      [STUDENT, DEMO_EVENTS.chess],
    );
    await page.goto(`/certificates/verify?code=${certificate.verify_code}`);
    await expect(page.getByText("Chess Championship")).toBeVisible();
    await page.goto("/certificates/verify?code=MADEUPCODE123");
    await expect(page.getByText("Not a valid certificate")).toBeVisible();

    await student1.goto(`/events/${DEMO_EVENTS.papers}#feedback`);
    await student1.getByRole("radio", { name: "4" }).check({ force: true });
    await student1.getByRole("button", { name: "Send feedback" }).click();
    await expect(student1.getByRole("button", { name: "Send feedback" })).toBeHidden();
  });

  await test.step("8. The whole college", async () => {
    await admin.goto("/manage/reports");
    await expect(admin.getByText("Computer Science and Engineering").first()).toBeVisible();
    await admin.goto("/manage/users");
    await expect(admin.getByText(demoEmail("student01")).first()).toBeVisible();
  });

  await test.step("9. Security: a student gets a real 403", async () => {
    const response = await student1.goto("/manage/users");
    expect(response?.status()).toBe(403);
  });

  for (const person of [student1, student2, coordinator, admin]) await person.context().close();
});
