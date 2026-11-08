import { expect, test, type APIRequestContext } from "@playwright/test";
import { DEMO_EVENTS } from "../prisma/demo-data";
import { ADMIN, COORDINATOR, logIn, OTHER_COORDINATOR, STUDENT } from "./support/actors";
import { eventId, sql } from "./support/db";

// Every route, tried by every kind of person. Pages must refuse from the server, so these
// check real responses rather than whether a link happens to be hidden.

const ADMIN_PAGES = [
  "/manage/users",
  "/manage/departments",
  "/manage/categories",
  "/manage/venues",
  "/manage/reports",
  "/manage/events/new",
];
const STAFF_PAGES = ["/manage/events", "/manage/check-in"];
const USER_PAGES = ["/profile", "/my-events"];
const PUBLIC_PAGES = ["/", "/events", "/login", "/signup", "/certificates/verify"];

test.describe("a signed-out visitor", () => {
  for (const path of [...ADMIN_PAGES, ...STAFF_PAGES, ...USER_PAGES]) {
    test(`is sent to log in from ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login\?next=/);
    });
  }

  for (const path of PUBLIC_PAGES) {
    test(`can open ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
    });
  }

  test("gets 401 from every API route", async ({ request }) => {
    const id = await eventId(DEMO_EVENTS.robotics);
    const calls = [
      request.get(`/api/v1/events/${id}/checkin`),
      request.post(`/api/v1/events/${id}/checkin`, { data: { ticketCode: "x" } }),
      request.delete(`/api/v1/events/${id}/checkin/abc`),
      request.get(`/api/v1/events/${id}/checkin/search?q=a`),
      request.get(`/api/v1/events/${id}/registrations`),
      request.get(`/api/v1/events/${id}/certificates`),
      request.get("/api/v1/certificates/abc"),
      request.get("/api/v1/me/notifications"),
      request.post("/api/v1/me/notifications", { data: { all: true } }),
    ];
    for (const response of await Promise.all(calls)) {
      expect(response.status(), response.url()).toBe(401);
      expect((await response.json()).error.code).toBe("UNAUTHENTICATED");
    }
  });

  test("gets 401 from the scheduled jobs without the secret", async ({ request }) => {
    for (const path of ["/api/cron/event-status", "/api/cron/reminders"]) {
      expect((await request.get(path)).status(), path).toBe(401);
      const wrong = await request.get(path, { headers: { authorization: "Bearer wrong" } });
      expect(wrong.status(), path).toBe(401);
    }
  });

  test("the scheduled job runs with the secret", async ({ request }) => {
    const response = await request.get("/api/cron/event-status", {
      headers: { authorization: "Bearer e2e-only-cron-secret" },
    });
    expect(response.status()).toBe(200);
  });

  test("can't see a draft event", async ({ page }) => {
    await page.goto(`/events/${DEMO_EVENTS.alumni}`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    const ics = await page.request.get(`/events/${DEMO_EVENTS.alumni}/calendar.ics`);
    expect(ics.status()).toBe(404);
  });
});

test.describe("a student", () => {
  test.beforeEach(({ page }) => logIn(page, STUDENT));

  for (const path of [...ADMIN_PAGES, ...STAFF_PAGES]) {
    test(`gets 403 from ${path}`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(403);
      await expect(page.getByText("You don't have access to this page")).toBeVisible();
      // Their own email shows in the account menu; nobody else's may.
      expect(await response?.text()).not.toMatch(/student(0[2-9]|[1-5]d|60)@/);
    });
  }

  for (const path of USER_PAGES) {
    test(`can open ${path}`, async ({ page }) => {
      expect((await page.goto(path))?.status()).toBe(200);
    });
  }

  test("gets 403 from staff APIs", async ({ page }) => {
    const api: APIRequestContext = page.request;
    const id = await eventId(DEMO_EVENTS.robotics);
    for (const response of await Promise.all([
      api.get(`/api/v1/events/${id}/checkin`),
      api.post(`/api/v1/events/${id}/checkin`, { data: { ticketCode: "x" } }),
      api.get(`/api/v1/events/${id}/registrations?format=csv`),
      api.get(`/api/v1/events/${id}/certificates`),
    ])) {
      expect(response.status(), response.url()).toBe(403);
    }
  });

  test("can't open someone else's ticket or certificate", async ({ page }) => {
    const [other] = await sql<{ id: string }>(
      `SELECT r.id FROM registrations r JOIN users u ON u.id = r.user_id
       WHERE u.email <> $1 AND r.status = 'CONFIRMED' LIMIT 1`,
      [STUDENT],
    );
    await page.goto(`/my-events/${other.id}/ticket`);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

    const [certificate] = await sql<{ id: string }>(
      `SELECT c.id FROM certificates c JOIN registrations r ON r.id = c.registration_id
       JOIN users u ON u.id = r.user_id WHERE u.email <> $1 LIMIT 1`,
      [STUDENT],
    );
    const response = await page.request.get(`/api/v1/certificates/${certificate.id}`);
    expect(response.status()).toBe(404);
  });
});

test.describe("a coordinator", () => {
  test.beforeEach(({ page }) => logIn(page, COORDINATOR));

  for (const path of ADMIN_PAGES) {
    test(`gets 403 from ${path}`, async ({ page }) => {
      expect((await page.goto(path))?.status()).toBe(403);
    });
  }

  test("can open their own event's pages", async ({ page }) => {
    const id = await eventId(DEMO_EVENTS.robotics);
    for (const path of ["", "/registrations", "/announcements", "/results"]) {
      await page.goto(`/manage/events/${id}${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Robotics Workshop");
    }
    await page.goto(`/manage/check-in/${id}`);
    await expect(page.getByTestId("checked-in-count")).toBeVisible();
  });

  test("can't touch another coordinator's event", async ({ page }) => {
    const id = await eventId(DEMO_EVENTS.webDesign); // Coordinator 2's.
    for (const path of [
      `/manage/events/${id}`,
      `/manage/events/${id}/registrations`,
      `/manage/events/${id}/announcements`,
      `/manage/events/${id}/results`,
      `/manage/check-in/${id}`,
    ]) {
      await page.goto(path);
      await expect(page.getByText("You don't have access to this page"), path).toBeVisible();
    }
    const api = await page.request.get(`/api/v1/events/${id}/registrations`);
    expect(api.status()).toBe(403);
    const post = await page.request.post(`/api/v1/events/${id}/checkin`, {
      data: { ticketCode: "x" },
    });
    expect(post.status()).toBe(403);
  });
});

test("the second coordinator does manage that event", async ({ page }) => {
  await logIn(page, OTHER_COORDINATOR);
  const id = await eventId(DEMO_EVENTS.webDesign);
  const response = await page.request.get(`/api/v1/events/${id}/registrations`);
  expect(response.status()).toBe(200);
});

test("an admin can open every staff page", async ({ page }) => {
  await logIn(page, ADMIN);
  for (const path of [...ADMIN_PAGES, ...STAFF_PAGES, ...USER_PAGES]) {
    expect((await page.goto(path))?.status(), path).toBe(200);
  }
});

test("a deactivated account stops working at once", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const email = "student60@demo.campusevents.test";
  await logIn(page, email);
  await page.goto("/profile");
  await expect(page.getByLabel("Full name")).toBeVisible();

  await sql("UPDATE users SET is_active = false WHERE email = $1", [email]);
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login/);
  await sql("UPDATE users SET is_active = true WHERE email = $1", [email]);
  await context.close();
});
