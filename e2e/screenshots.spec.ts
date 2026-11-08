import { mkdirSync } from "node:fs";
import { test, type Browser, type Page } from "@playwright/test";
import { demoEmail, DEMO_EVENTS } from "../prisma/demo-data";
import { ADMIN, COORDINATOR, logIn, STUDENT } from "./support/actors";
import { eventId, ticketCode } from "./support/db";

// Refreshes the pictures in docs/screenshots from the made-up demo college.
// Run with: npm run docs:screenshots

const DIR = "docs/screenshots";
mkdirSync(DIR, { recursive: true });

async function shot(page: Page, name: string, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

async function person(
  browser: Browser,
  email: string | null,
  baseURL: string | undefined,
  phone = false,
) {
  const context = await browser.newContext({
    baseURL,
    colorScheme: "light",
    timezoneId: "Asia/Kolkata",
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
  });
  const page = await context.newPage();
  if (email) await logIn(page, email);
  return page;
}

test("take the README's screenshots", async ({ browser, baseURL }) => {
  test.setTimeout(180_000);

  const visitor = await person(browser, null, baseURL);
  await shot(visitor, "home", "/");
  await shot(visitor, "events", "/events");
  await shot(visitor, "event-page", `/events/${DEMO_EVENTS.webDesign}`);

  const student = await person(browser, STUDENT, baseURL);
  await shot(student, "my-events", "/my-events");
  await student.context().close();

  const robotics = await eventId(DEMO_EVENTS.robotics);
  const coordinator = await person(browser, COORDINATOR, baseURL);
  await shot(coordinator, "registrations", `/manage/events/${robotics}/registrations`);
  await shot(coordinator, "results", `/manage/events/${await eventId(DEMO_EVENTS.chess)}/results`);
  await coordinator.context().close();

  const admin = await person(browser, ADMIN, baseURL);
  await shot(admin, "reports", "/manage/reports");
  await admin.context().close();

  // The two screens people use at the door, at phone size.
  const phoneStudent = await person(browser, demoEmail("student04"), baseURL, true);
  await phoneStudent.goto(`/events/${DEMO_EVENTS.carrom}`);
  await phoneStudent.getByRole("button", { name: "Register" }).click();
  await phoneStudent.getByRole("link", { name: "Show ticket" }).click();
  await phoneStudent.waitForLoadState("networkidle");
  await phoneStudent.screenshot({ path: `${DIR}/phone-ticket.png` });
  await phoneStudent.context().close();

  const phoneCoordinator = await person(browser, COORDINATOR, baseURL, true);
  await phoneCoordinator.goto(`/manage/check-in/${await eventId(DEMO_EVENTS.carrom)}`);
  await phoneCoordinator
    .getByLabel(/Can't scan\?/)
    .fill(await ticketCode(demoEmail("student04"), DEMO_EVENTS.carrom));
  await phoneCoordinator.getByRole("button", { name: "Find" }).click();
  await phoneCoordinator.getByRole("status").getByText("Checked in").waitFor();
  await phoneCoordinator.screenshot({ path: `${DIR}/phone-check-in.png` });
  await phoneCoordinator.context().close();

  // A verified certificate, signed out.
  const verify = visitor;
  await verify.goto(`/events/${DEMO_EVENTS.chess}`);
  await verify.waitForLoadState("networkidle");
  await verify.screenshot({ path: `${DIR}/event-results.png` });
  await visitor.context().close();
});
