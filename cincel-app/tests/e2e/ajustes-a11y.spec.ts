/**
 * E2E: axe on every Ajustes page and on the clock-in prompt, in the three themes, light and dark
 * (redesign Phase 6 Done Definition; FE §16, §18 item 13). Serious and critical violations fail.
 *
 * Theme and mode are the viewer's own preferences (`user_preferences.theme` / `mode`), set in the DB
 * before each load. The time-tracking row is snapshotted and put back afterwards.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";
import {
  ADMIN_EMAIL,
  BASE_URL,
  createStaffUser,
  expectAxeClean,
  patchSettingData,
  readSettingRaw,
  resetAdminPreferences,
  restoreSettingRaw,
  setAppearanceFor,
  setRedesignFor,
  signedInContext,
  withDb,
  type E2EUser,
  type ModeChoice,
  type ThemeChoice,
} from "./helpers/redesign";

const THEMES: ThemeChoice[] = ["azul", "calido", "grafito"];
const MODES: Exclude<ModeChoice, "system">[] = ["light", "dark"];
const AJUSTES_PAGES = [
  "/ajustes/apariencia",
  "/ajustes/perfil",
  "/ajustes/tema",
  "/ajustes/horario",
  "/ajustes/general",
  "/ajustes/estatus",
  "/ajustes/permisos",
];
const SETTINGS_KEY = "time_tracking";

test.describe("Ajustes — accesibilidad en los tres temas", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  let snapshot: string | null = null;
  let worker: E2EUser;

  test.beforeAll(async () => {
    snapshot = await readSettingRaw(SETTINGS_KEY);
    await setRedesignFor(ADMIN_EMAIL, true);
    worker = await createStaffUser({ tag: "Axe", role: "Colaborador" });
    await setRedesignFor(worker.email, true);
  });

  test.afterAll(async () => {
    await restoreSettingRaw(SETTINGS_KEY, snapshot);
    await resetAdminPreferences();
  });

  for (const theme of THEMES) {
    for (const mode of MODES) {
      test(`Ajustes pages are axe clean — ${theme} ${mode}`, async ({ page }) => {
        await setAppearanceFor(ADMIN_EMAIL, { theme, mode });
        await loginAsAdmin(page, BASE_URL);
        for (const path of AJUSTES_PAGES) {
          await test.step(path, async () => {
            await page.goto(`${BASE_URL}${path}`, { waitUntil: "load" });
            await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
            await expect
              .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme-id")))
              .toBe(theme);
            await expect
              .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
              .toBe(mode);
            await page.waitForLoadState("networkidle");
            await expectAxeClean(page, `${path} (${theme} ${mode})`);
          });
        }
      });

      test(`the clock-in prompt is axe clean — ${theme} ${mode}`, async ({ browser }) => {
        await patchSettingData(SETTINGS_KEY, {
          enabled: true,
          requiredFrom: null,
          workDays: [0, 1, 2, 3, 4, 5, 6],
          promptAtLogin: true,
          exemptRoles: [],
        });
        await withDb((sql) => sql`delete from core.time_entries where staff_id = ${worker.staffId}`);
        await setAppearanceFor(worker.email, { theme, mode });
        const { context, page } = await signedInContext(browser, worker);
        try {
          await expect(
            page.getByRole("dialog").filter({ hasText: "Registra tu entrada para empezar el día." }),
          ).toBeVisible({ timeout: 30_000 });
          await expectAxeClean(page, `ClockInPrompt (${theme} ${mode})`);
        } finally {
          await context.close();
        }
      });
    }
  }
});
