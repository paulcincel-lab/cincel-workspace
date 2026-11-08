/**
 * E2E: one axe check per theme (redesign FE §16, §18 item 13). A collaborator's Ajustes › Apariencia
 * page — the shell (sidebar, header, assistant button) plus a settings form — has no serious or
 * critical violation in Azul Cincel, Cálido and Grafito. Light mode in every case.
 *
 * The theme is the viewer's own preference (`user_preferences.theme`), set in the DB before signing
 * in; the org lets users pick their theme by default (`allowUserOverride`). The collaborator is an
 * E2E row, removed by global-cleanup with its preferences.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import {
  BASE_URL,
  createStaffUser,
  expectAxeClean,
  setAppearanceFor,
  signedInContext,
  type ThemeChoice,
} from "./helpers/redesign";

const THEMES: ThemeChoice[] = ["azul", "calido", "grafito"];
const PAGE = "/ajustes/apariencia";

test.describe("Accesibilidad — un tema a la vez", () => {
  for (const theme of THEMES) {
    test(`${PAGE} is axe clean — ${theme}`, async ({ browser }) => {
      const viewer = await createStaffUser({ tag: `Axe${theme}`, role: "Colaborador" });
      await setAppearanceFor(viewer.email, { theme, mode: "light" });
      const { context, page } = await signedInContext(browser, viewer, { colorScheme: "light" });
      try {
        await page.goto(`${BASE_URL}${PAGE}`, { waitUntil: "load" });
        await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
        await expect
          .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme-id")))
          .toBe(theme);
        await expect
          .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
          .toBe("light");
        await page.waitForLoadState("networkidle");
        await expectAxeClean(page, `${PAGE} (${theme})`);
      } finally {
        await context.close();
      }
    });
  }
});
