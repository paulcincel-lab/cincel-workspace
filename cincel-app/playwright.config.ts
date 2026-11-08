import { defineConfig, devices } from "@playwright/test";

const e2ePort = process.env.E2E_PORT ?? "3000";
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;

/**
 * Specs that change state every signed-in page reads: the org theme
 * (`appearance.theme`), Control de horario (`time_tracking`, whose login
 * prompt would cover any page) and the admin's own appearance preferences.
 * They run one at a time, after the rest of the suite.
 */
const ORG_SETTINGS_SPECS = ["**/tema-publicar.spec.ts", "**/control-horario.spec.ts", "**/appearance-b18.spec.ts"];

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-cleanup.ts",
  // Spec files run in parallel; the tests inside one file keep their order.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: ORG_SETTINGS_SPECS,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "org-settings",
      testMatch: ORG_SETTINGS_SPECS,
      dependencies: ["chromium"],
      workers: 1,
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
        url: `http://127.0.0.1:${e2ePort}`,
        reuseExistingServer: !process.env.CI,
        timeout: process.env.CI ? 180_000 : 120_000,
        env: {
          PORT: e2ePort,
          DATABASE_URL:
            process.env.DATABASE_URL ??
            "postgres://cincel:cincel@localhost:5432/cincel",
        },
      },
});
