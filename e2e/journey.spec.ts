import { expect, test } from "@playwright/test";
import { DEMO_EVENTS } from "../prisma/demo-data";
import { COORDINATOR, personFor, verifiedStudent } from "./support/actors";
import { copyEvent, finishEvent, sql, ticketCode } from "./support/db";

// The journey the spec names: sign-up → register → check-in → certificate, followed by
// the public verify page and feedback. It runs on a desktop and a phone screen.

test("a new student goes from sign-up to a verified certificate", async ({
  page,
  browser,
  baseURL,
}) => {
  const event = await copyEvent(DEMO_EVENTS.carrom);

  await test.step("student signs up, verifies their email and registers", async () => {
    await verifiedStudent(page).then((s) => test.info().attach("student", { body: s.email }));
    await page.goto(`/events/${event.slug}`);
    await expect(page.getByRole("heading", { name: event.title })).toBeVisible();
    await page.getByRole("button", { name: "Register" }).click();
    await expect(page.getByText("You're registered.")).toBeVisible();
  });

  const email = (
    await sql<{ email: string }>(
      `SELECT email FROM users WHERE email LIKE 'e2e-%' ORDER BY created_at DESC LIMIT 1`,
    )
  )[0].email;
  const code = await ticketCode(email, event.slug);

  await test.step("the ticket page shows a QR code and the typed form of the code", async () => {
    await page.getByRole("link", { name: "Show ticket" }).click();
    await expect(page).toHaveURL(/\/ticket$/);
    await expect(page.getByRole("img", { name: /QR/i })).toBeVisible();
    await expect(page.getByText(code.slice(0, 4))).toBeVisible();
  });

  const coordinator = await personFor(browser, COORDINATOR, baseURL);

  await test.step("coordinator checks them in by ticket code, once only", async () => {
    await coordinator.goto(`/manage/check-in/${event.id}`);
    await expect(coordinator.getByTestId("checked-in-count")).toHaveText("0");

    const search = coordinator.getByLabel(/Can't scan\?/);
    await search.fill(code);
    await coordinator.getByRole("button", { name: "Find" }).click();
    await expect(coordinator.getByRole("status").getByText("Checked in")).toBeVisible();
    await expect(coordinator.getByTestId("checked-in-count")).toHaveText("1");

    await search.fill(code);
    await coordinator.getByRole("button", { name: "Find" }).click();
    await expect(coordinator.getByRole("status").getByText(/Already checked in/)).toBeVisible();
    await expect(coordinator.getByTestId("checked-in-count")).toHaveText("1");
  });

  await finishEvent(event.slug);

  await test.step("coordinator enters the result and issues certificates", async () => {
    await coordinator.goto(`/manage/events/${event.id}/results`);
    await coordinator.getByLabel("1st place").selectOption({ index: 1 });
    await coordinator.getByRole("button", { name: "Save results" }).click();
    await expect(coordinator.getByText(/results saved/i).first()).toBeVisible();

    await coordinator
      .getByRole("button", { name: /certificates/i })
      .first()
      .click();
    await expect(coordinator.getByText(/issued|2 certificates/i).first()).toBeVisible();
  });

  let certificateId = "";
  let verifyCode = "";

  await test.step("student downloads a real PDF from My events", async () => {
    await page.goto("/my-events");
    const row = page.getByRole("listitem").filter({ hasText: event.title });
    const merit = row.getByRole("link", { name: "Merit certificate" });
    await expect(merit).toBeVisible();
    await expect(row.getByRole("link", { name: "Participation certificate" })).toBeVisible();

    const href = await merit.getAttribute("href");
    certificateId = href!.split("/").pop()!;
    const pdf = await page.request.get(href!);
    expect(pdf.ok()).toBe(true);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const [certificate] = await sql<{ verify_code: string }>(
      "SELECT verify_code FROM certificates WHERE id = $1",
      [certificateId],
    );
    verifyCode = certificate.verify_code;
  });

  await test.step("anyone can verify it, signed out", async () => {
    const context = await browser.newContext({ baseURL });
    const visitor = await context.newPage();
    await visitor.goto(`/certificates/verify?code=${verifyCode}`);
    await expect(visitor.getByText(event.title)).toBeVisible();
    await expect(visitor.getByText("Merit certificate").first()).toBeVisible();

    await visitor.goto("/certificates/verify?code=NOTAREALCODE");
    await expect(visitor.getByText("Not a valid certificate")).toBeVisible();
    await context.close();
  });

  await test.step("student leaves feedback, once only", async () => {
    await page.goto(`/events/${event.slug}#feedback`);
    await page.getByRole("radio", { name: "5" }).check({ force: true });
    await page.getByLabel("Comment (optional)").fill("Smooth check-in.");
    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(page.getByText(/thank/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Send feedback" })).toBeHidden();

    await coordinator.goto(`/manage/events/${event.id}/results`);
    await expect(coordinator.getByText("Smooth check-in.")).toBeVisible();
  });

  await coordinator.context().close();
});
