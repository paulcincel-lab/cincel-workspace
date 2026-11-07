/**
 * E2E (review B18): with the OS in dark mode, the flag-on appearance follows
 * the user's mode — an explicit light choice is never overridden by the legacy
 * `prefers-color-scheme` rule in globals.css — and flag-off pages keep today's
 * pipeline. Covers light, dark, system and flag-off.
 *
 * The admin's `user_preferences` row is written directly and removed after.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { THEME_PRESETS } from "../../lib/ui/themes";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx";
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

type Mode = "light" | "dark" | "system";
type ThemeKey = keyof typeof THEME_PRESETS;

/** Writes (or with null removes) the admin's preferences row. */
async function setAdminPreferences(prefs: { mode: Mode; redesignEnabled: boolean } | null): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [admin] = await sql`select id from core.staff where lower(email) = ${ADMIN_EMAIL.toLowerCase()} limit 1`;
    if (!admin) throw new Error("seeded admin not found");
    if (!prefs) {
      await sql`delete from core.user_preferences where staff_id = ${admin.id}`;
      return;
    }
    await sql`
      insert into core.user_preferences (staff_id, mode, redesign_enabled)
      values (${admin.id}, ${prefs.mode}, ${prefs.redesignEnabled})
      on conflict (staff_id) do update set mode = excluded.mode, redesign_enabled = excluded.redesign_enabled`;
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
      primaryBlock: document.getElementById("primary-color") !== null,
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
    await setAdminPreferences({ mode: "light", redesignEnabled: true });
    await openApp(page);
    const state = await htmlState(page);
    expect(state.dataTheme).toBe("light");
    expect(state.dark).toBe(false);
    expect(state.appearanceBlock).toBe(true);
    expect(state.modeScript).toBe(false);
    expect(state.styleAttr).toBeNull();
    expect(state.background).toBe(expectedBackground(state.themeId, "light"));
  });

  test("dark: data-theme dark and .dark together", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await setAdminPreferences({ mode: "dark", redesignEnabled: true });
    await openApp(page);
    const state = await htmlState(page);
    expect(state.dataTheme).toBe("dark");
    expect(state.dark).toBe(true);
    expect(state.modeScript).toBe(false);
    expect(state.styleAttr).toBeNull();
    expect(state.background).toBe(expectedBackground(state.themeId, "dark"));
  });

  test("system: follows the OS before paint and on change", async ({ page }) => {
    await setAdminPreferences({ mode: "system", redesignEnabled: true });
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

  test("flag off: today's pipeline, no appearance block, attributes or head script", async ({ page }) => {
    await setAdminPreferences({ mode: "light", redesignEnabled: false });
    await openApp(page);
    const state = await htmlState(page);
    expect(state.appearanceBlock).toBe(false);
    expect(state.modeScript).toBe(false);
    expect(state.themeId).toBeNull();
    // Legacy globals.css: a dark OS gets the Grafito dark background.
    expect(state.background).toBe("#141414");
  });
});
