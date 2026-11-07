/**
 * E2E: an admin publishes the organization theme in Ajustes › Tema y estilo and another user sees it on
 * their next page load (redesign Phase 6; FE §3.8, §18 item 5; BE §7.1, §17 item 2).
 *
 * The admin starts from the Cálido preset ("Partir de"), publishes it ("Publicar para todos" →
 * `saveOrgAppearanceAction`), and a second user — in their own browser context, following the org theme —
 * gets `data-theme-id="calido"` and the Cálido tokens in `<style id="appearance">` after a reload.
 * The org theme row is snapshotted before and put back afterwards.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";
import {
  ADMIN_EMAIL,
  BASE_URL,
  createStaffUser,
  patchSettingData,
  readSettingData,
  readSettingRaw,
  resetAdminPreferences,
  restoreSettingRaw,
  setAppearanceFor,
  setRedesignFor,
  signedInContext,
  type E2EUser,
} from "./helpers/redesign";

const THEME_KEY = "appearance.theme";
/** Cálido `--primary`, light mode (BE §5, `lib/ui/themes.ts`). */
const CALIDO_PRIMARY_LIGHT = "#26211c";

type OrgAppearanceData = { baseTheme: string; v: number; tokens: Record<string, { light: string; dark: string }> };

const themeId = (page: Page) => page.evaluate(() => document.documentElement.getAttribute("data-theme-id"));
const appearanceBlock = (page: Page) =>
  page.evaluate(() => document.getElementById("appearance")?.textContent?.toLowerCase() ?? "");

test.describe("Tema de la organización — publicar para todos", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  let snapshot: string | null = null;
  let other: E2EUser;

  test.beforeAll(async () => {
    snapshot = await readSettingRaw(THEME_KEY);
    // Start from the seeded Azul preset with overrides allowed, so the change is visible.
    await patchSettingData(THEME_KEY, { allowUserOverride: true, redesignAvailable: true });
    expect((await readSettingData<OrgAppearanceData>(THEME_KEY))?.baseTheme, "org theme before the run").toBe("azul");

    await setRedesignFor(ADMIN_EMAIL, true);
    await setAppearanceFor(ADMIN_EMAIL, { theme: null, mode: "light" });
    other = await createStaffUser({ tag: "Tema", role: "Colaborador" });
    await setRedesignFor(other.email, true);
    // Follows the org theme (theme null), light mode for a stable token check.
    await setAppearanceFor(other.email, { theme: null, mode: "light" });
  });

  test.afterAll(async () => {
    await restoreSettingRaw(THEME_KEY, snapshot);
    await resetAdminPreferences();
  });

  test("the admin publishes Cálido and a second user sees it on the next load", async ({ page, browser }) => {
    // Second user, before: the org theme is Azul.
    const { context: otherContext, page: otherPage } = await signedInContext(browser, other, { colorScheme: "light" });
    try {
      await expect.poll(() => themeId(otherPage), { timeout: 15_000 }).toBe("azul");
      expect(await appearanceBlock(otherPage)).not.toContain(CALIDO_PRIMARY_LIGHT);

      // Admin: Ajustes › Tema y estilo, start from Cálido and publish.
      await loginAsAdmin(page, BASE_URL);
      await page.goto(`${BASE_URL}/ajustes/tema`, { waitUntil: "domcontentloaded" });
      const publish = page.getByRole("button", { name: "Publicar para todos" });
      await expect(publish).toBeVisible({ timeout: 30_000 });
      await page.getByRole("button", { name: "Cálido", exact: true }).first().click();
      // Every seeded preset passes the shared contrast list, so publishing is allowed.
      await expect(page.getByText(/cumple 4\.5:1/).first()).toBeVisible();
      await expect(publish).toBeEnabled();
      const before = await readSettingData<OrgAppearanceData>(THEME_KEY);
      await publish.click();

      await expect
        .poll(async () => (await readSettingData<OrgAppearanceData>(THEME_KEY))?.baseTheme, { timeout: 15_000 })
        .toBe("calido");
      const after = await readSettingData<OrgAppearanceData>(THEME_KEY);
      // The cookie version is bumped so every viewer re-reads the theme.
      expect(after?.v).toBeGreaterThan(before?.v ?? 0);
      expect(after?.tokens?.primary?.light?.toLowerCase()).toBe(CALIDO_PRIMARY_LIGHT);

      // Second user, next page load: the new org theme.
      await otherPage.reload({ waitUntil: "domcontentloaded" });
      await expect.poll(() => themeId(otherPage), { timeout: 15_000 }).toBe("calido");
      await expect.poll(() => appearanceBlock(otherPage)).toContain(CALIDO_PRIMARY_LIGHT);
      await expect
        .poll(() =>
          otherPage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim().toLowerCase()),
        )
        .toBe(CALIDO_PRIMARY_LIGHT);
    } finally {
      await otherContext.close();
    }
  });

  test("Restablecer asks for confirmation and goes back to the Azul preset", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/ajustes/tema`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Publicar para todos" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Azul Cincel", exact: true }).first().click();
    await page.getByRole("button", { name: "Restablecer", exact: true }).click();
    const confirm = page.getByRole("dialog");
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: /Restablecer/ }).click();

    await expect
      .poll(async () => (await readSettingData<OrgAppearanceData>(THEME_KEY))?.baseTheme, { timeout: 15_000 })
      .toBe("azul");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => themeId(page), { timeout: 15_000 }).toBe("azul");
  });
});
