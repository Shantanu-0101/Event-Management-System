import { randomBytes } from "node:crypto";
import { expect, type Browser, type Page } from "@playwright/test";
import { demoEmail } from "../../prisma/demo-data";
import { verifyEmailLink } from "./db";

export const DEMO_PASSWORD = "demo-password-2026";

export const ADMIN = demoEmail("admin");
export const COORDINATOR = demoEmail("coordinator1");
export const OTHER_COORDINATOR = demoEmail("coordinator2");
export const STUDENT = demoEmail("student01");

export async function logIn(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** A separate browser session, like another person's phone. */
export async function personFor(browser: Browser, email: string, baseURL?: string) {
  const context = await browser.newContext({ baseURL, timezoneId: "Asia/Kolkata" });
  const page = await context.newPage();
  await logIn(page, email);
  return page;
}

export type NewStudent = { name: string; email: string; rollNo: string; password: string };

export function newStudentDetails(): NewStudent {
  const id = randomBytes(4).toString("hex").toUpperCase();
  return {
    name: `Test Student ${id}`,
    email: `e2e-${id.toLowerCase()}@test.local`,
    rollNo: `E2E${id}`,
    password: "e2e-student-password",
  };
}

export async function signUp(page: Page, student: NewStudent) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(student.name);
  await page.getByLabel("College email").fill(student.email);
  await page.getByLabel("Roll number").fill(student.rollNo);
  await page.getByLabel("Year").selectOption("3");
  await page.getByLabel("Department").selectOption({ label: "Computer Science and Engineering" });
  await page.getByLabel("Password", { exact: true }).fill(student.password);
  await page.getByLabel("Confirm password").fill(student.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/profile\?welcome=1/);
}

/** Signs a new student up and clicks the link from their verification email. */
export async function verifiedStudent(page: Page, student = newStudentDetails()) {
  await signUp(page, student);
  await page.goto(await verifyEmailLink(student.email));
  await expect(page.getByText(/verified/i).first()).toBeVisible();
  return student;
}
