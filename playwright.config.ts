import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// On a laptop the tests use the Chrome already installed. CI installs Playwright's own.
const browser = process.env.CI ? {} : { channel: process.env.E2E_BROWSER ?? "chrome" };

export default defineConfig({
  testDir: "e2e",
  // The journeys share one server and database, and the check-in counters are exact.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/support/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: ["**/screenshots.spec.ts"],
      use: { ...devices["Desktop Chrome"], ...browser },
    },
    {
      // Most students use phones, so the main journey and page checks run here too.
      name: "phone",
      testMatch: ["**/journey.spec.ts", "**/pages.spec.ts"],
      use: { ...devices["Pixel 7"], ...browser },
    },
    {
      // Not a test: `npm run docs:screenshots` refreshes the README's pictures.
      name: "screenshots",
      testMatch: ["**/screenshots.spec.ts"],
      use: { ...devices["Desktop Chrome"], ...browser },
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://localhost:${PORT}`,
    // A production build takes a while. Reusing lets you rerun tests without rebuilding.
    timeout: 10 * 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
