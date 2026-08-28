import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // In CI, `next dev`'s on-demand per-route compilation is slow and
        // unpredictable under shared runners -- the first visit to each new
        // route can eat several seconds, which made login/interaction steps
        // flaky against a 30s test timeout. A production build removes that
        // variable entirely, so CI runs against `next build && next start`;
        // local runs keep `next dev` for fast iteration without a build step.
        command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
        url: "http://127.0.0.1:3000",
        reuseExistingServer: !process.env.CI,
        timeout: process.env.CI ? 180_000 : 120_000,
        env: {
          PORT: "3000",
          DATABASE_URL:
            process.env.DATABASE_URL ??
            "postgres://cincel:cincel@localhost:5432/cincel",
        },
      },
});
