/**
 * E2E (review B18): with the OS in dark mode, the appearance follows the
 * user's mode — an explicit light choice is never overridden by the
 * `prefers-color-scheme` fallback rule in globals.css. Covers light, dark and
 * system, and the light default for a user without a saved mode.
 *
 * The admin's `user_preferences` row is written directly and removed after.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { THEME_PRESETS } from "../../lib/ui/themes";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx";
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

type Mode = "light" | "dark" | "system";
type ThemeKey = keyof typeof THEME_PRESETS;

/** Writes (or with null removes) the admin's preferences row. */
async function setAdminPreferences(prefs: { mode: Mode } | null): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [admin] = await sql`select id from core.staff where lower(email) = ${ADMIN_EMAIL.toLowerCase()} limit 1`;
    if (!admin) throw new Error("seeded admin not found");
    if (!prefs) {
      await sql`delete from core.user_preferences where staff_id = ${admin.id}`;
      return;
    }
    await sql`
      insert into core.user_preferences (staff_id, mode)
      values (${admin.id}, ${prefs.mode})
      on conflict (staff_id) do update set mode = excluded.mode`;
  } finally {
    await sql.end();
  }
}

async function htmlState(page: Page) {
  return page.evaluate(() => {
    const html = document.documentElement;
    return {
      dataTheme: html.getAttribute("data-theme"),
      themeId: html.getAttribute("data-theme-id"),
      dark: html.classList.contains("dark"),
      styleAttr: html.getAttribute("style"),
      appearanceBlock: document.getElementById("appearance") !== null,
      modeScript: document.getElementById("appearance-mode") !== null,
      background: getComputedStyle(html).getPropertyValue("--background").trim().toLowerCase(),
    };
  });
}

function expectedBackground(themeId: string | null, mode: "light" | "dark"): string {
  if (!themeId || !(themeId in THEME_PRESETS)) throw new Error(`unexpected data-theme-id ${themeId}`);
  return THEME_PRESETS[themeId as ThemeKey].tokens.background[mode].toLowerCase();
}

async function openApp(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
}

test.describe("Apariencia — B18 dark-scheme run", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await loginAsAdmin(page, BASE_URL);
  });

  test.afterEach(async () => {
    await setAdminPreferences(null);
  });

  test("light: an explicit light choice wins over a dark OS", async ({ page }) => {
    await setAdminPreferences({ mode: "light" });
    await openApp(page);
    const state = await htmlState(page);
    expect(state.dataTheme).toBe("light");
    expect(state.dark).toBe(false);
    expect(state.appearanceBlock).toBe(true);
    expect(state.modeScript).toBe(false);
    expect(state.styleAttr).toBeNull();
    expect(state.background).toBe(expectedBackground(state.themeId, "light"));
  });

  test("no saved preference: a new user sees light Azul Cincel on a dark OS", async ({ page }) => {
    await setAdminPreferences(null);
    await openApp(page);
    const state = await htmlState(page);
    expect(state.dataTheme).toBe("light");
    expect(state.dark).toBe(false);
    expect(state.modeScript).toBe(false);
    expect(state.background).toBe(expectedBackground(state.themeId, "light"));
  });

  test("dark: data-theme dark and .dark together", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await setAdminPreferences({ mode: "dark" });
    await openApp(page);
    const state = await htmlState(page);
    expect(state.dataTheme).toBe("dark");
    expect(state.dark).toBe(true);
    expect(state.modeScript).toBe(false);
    expect(state.styleAttr).toBeNull();
    expect(state.background).toBe(expectedBackground(state.themeId, "dark"));
  });

  test("system: follows the OS before paint and on change", async ({ page }) => {
    await setAdminPreferences({ mode: "system" });
    await openApp(page);
    let state = await htmlState(page);
    expect(state.modeScript).toBe(true);
    expect(state.dataTheme).toBe("dark");
    expect(state.dark).toBe(true);
    expect(state.background).toBe(expectedBackground(state.themeId, "dark"));

    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(async () => (await htmlState(page)).dataTheme).toBe("light");
    state = await htmlState(page);
    expect(state.dark).toBe(false);
    expect(state.background).toBe(expectedBackground(state.themeId, "light"));
  });
});

test.describe("Apariencia — changes apply without a reload", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await loginAsAdmin(page, BASE_URL);
  });

  test.afterEach(async () => {
    await setAdminPreferences(null);
  });

  test("mode, density and style chosen in Ajustes › Apariencia reach <html> and the next page", async ({ page }) => {
    await setAdminPreferences({ mode: "light" });
    await page.goto(`${BASE_URL}/ajustes/apariencia`, { waitUntil: "load" });
    await expect(page.getByRole("radio", { name: "Oscuro" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("radio", { name: "Oscuro" }).click();
    await expect.poll(async () => (await htmlState(page)).dataTheme).toBe("dark");
    expect((await htmlState(page)).dark).toBe(true);

    await page.getByRole("radio", { name: "Compacta" }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-density")))
      .toBe("compacta");

    const analitico = page.getByRole("radio", { name: "Analítico" });
    if (await analitico.isEnabled()) {
      await analitico.click();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-style")))
        .toBe("analitico");
      // Client navigation: the next page reads the same store, no reload.
      await page.getByRole("link", { name: "Inicio" }).first().click();
      await page.waitForURL(/\/inicio/);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-style")))
        .toBe("analitico");
    }
  });
});

test.describe("Apariencia — default mode before sign-in", () => {
  test("the login page renders light on a dark OS", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(`${BASE_URL}/login`, { waitUntil: "load" });
    const state = await htmlState(page);
    expect(state.dataTheme).toBe("light");
    expect(state.dark).toBe(false);
    expect(state.modeScript).toBe(false);
    expect(state.background).toBe(expectedBackground(state.themeId, "light"));
  });
});
