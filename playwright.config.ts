import { defineConfig, devices } from "@playwright/test";

/**
 * E2E-tests draaien tegen een lokale Supabase-stack (`supabase start` +
 * `node scripts/local-setup.mjs`) en de app met AI_MOCK=true (deterministische
 * AI-antwoorden, geen kosten). Zie DEPLOYMENT.md › Testen.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || (process.env.CI ? undefined : "/opt/pw-browsers/chromium-1194/chrome-linux/chrome");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions: executablePath ? { executablePath } : {} },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: process.env.CI ? "npm run start -- -p 3000" : "npx next dev -p 3000",
        url: "http://localhost:3000/inloggen",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
