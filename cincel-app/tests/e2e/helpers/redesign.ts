import { randomBytes, scrypt as scryptCb } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import postgres from "postgres";

/**
 * Shared helpers for the redesign e2e specs (Phase 6: Ajustes, tema y
 * Control de horario).
 *
 * Org settings live in `core.app_settings` as
 * `{ version: 1, data }` JSON (BE §3.12); specs that change them snapshot the
 * row first and put it back afterwards.
 *
 * Every staff row created here has "E2E" in its name, so the global cleanup
 * removes it (credentials, preferences, sessions and time entries cascade).
 */

const scrypt = promisify(scryptCb);

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx";

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

/** Pages a signed-in staff member can land on. */
export const STAFF_LANDING = /\/inicio|\/dashboard|\/directorio|\/proyectos|\/tareas|\/equipo|\/change-password/;

export async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Name of the appearance cookie (`APPEARANCE_COOKIE` in `lib/ui/preferences.ts`). */
export const APPEARANCE_COOKIE = "cincel-appearance";

/** Drops the appearance cookie so the next request renders from the DB. */
export async function clearAppearanceCookie(context: BrowserContext): Promise<void> {
  await context.clearCookies({ name: APPEARANCE_COOKIE });
}

export type ThemeChoice = "azul" | "calido" | "grafito";
export type ModeChoice = "light" | "dark" | "system";

/** Sets one staff member's own theme and mode (theme null = the org theme). */
export async function setAppearanceFor(
  email: string,
  prefs: { theme?: ThemeChoice | null; mode?: ModeChoice },
): Promise<void> {
  await withDb(async (sql) => {
    const theme = prefs.theme === undefined ? null : prefs.theme;
    const mode = prefs.mode ?? "system";
    await sql`
      insert into core.user_preferences (staff_id, theme, mode)
      select id, ${theme}, ${mode} from core.staff
      where lower(email) = lower(${email}) and deleted_at is null
      on conflict (staff_id) do update set theme = excluded.theme, mode = excluded.mode, updated_at = now()`;
  });
}

/** Removes every preference row change of the admin made by a spec (back to all defaults). */
export async function resetAdminPreferences(): Promise<void> {
  await withDb(async (sql) => {
    await sql`
      update core.user_preferences set theme = null, mode = 'system', updated_at = now()
      where staff_id in (select id from core.staff where lower(email) = lower(${ADMIN_EMAIL}))`;
  });
}

export type E2EUser = { email: string; password: string; name: string; staffId: string };

/** Creates an active staff member with a password login, no first-access step and no onboarding wizard. */
export async function createStaffUser(opts: { tag: string; role: string }): Promise<E2EUser> {
  const runId = `${Date.now()}${randomBytes(2).toString("hex")}`;
  const name = `Persona ${opts.tag} E2E ${runId}`;
  const email = `e2e-${opts.tag.toLowerCase()}-${runId}@cincel.test`;
  const password = `E2e-${randomBytes(9).toString("hex")}`;
  const salt = randomBytes(16).toString("hex");
  const hash = ((await scrypt(password.normalize("NFKC"), salt, 64)) as Buffer).toString("hex");
  const staffId = await withDb(async (sql) => {
    const [row] = await sql`
      insert into core.staff (name, email, role, active, onboarding_completed_at)
      values (${name}, ${email}, ${opts.role}, true, now()) returning id`;
    await sql`
      insert into core.auth_credentials (staff_id, password_hash, salt, enabled, must_change_password, password_updated_at)
      values (${row.id}, ${hash}, ${salt}, true, false, now())`;
    return row.id as string;
  });
  return { email, password, name, staffId };
}

/** Signs in with the login form and waits for the first staff page. */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "load" });
  await page.getByLabel("Correo institucional").fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(STAFF_LANDING, { timeout: 20_000 });
}

/** A fresh browser context signed in as the given user. */
export async function signedInContext(
  browser: Browser,
  user: { email: string; password: string },
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE_URL, ...options });
  const page = await context.newPage();
  await loginAs(page, user.email, user.password);
  return { context, page };
}

/** Raw `app_settings.value` of a key, or null when the row is missing. */
export async function readSettingRaw(key: string): Promise<string | null> {
  return withDb(async (sql) => {
    const [row] = await sql`select value from core.app_settings where key = ${key}`;
    return row ? (row.value as string) : null;
  });
}

/** Puts back a value read with `readSettingRaw` (null deletes the row). */
export async function restoreSettingRaw(key: string, value: string | null): Promise<void> {
  await withDb(async (sql) => {
    if (value === null) {
      await sql`delete from core.app_settings where key = ${key}`;
      return;
    }
    await sql`
      insert into core.app_settings (key, value) values (${key}, ${value})
      on conflict (key) do update set value = excluded.value, updated_at = now()`;
  });
}

/** The `data` object of a versioned `app_settings` row. */
export async function readSettingData<T = Record<string, unknown>>(key: string): Promise<T | null> {
  const raw = await readSettingRaw(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { version: number; data: T };
  return parsed.data;
}

/** Merges `patch` into the `data` of a versioned `app_settings` row. */
export async function patchSettingData(key: string, patch: Record<string, unknown>): Promise<void> {
  const current = (await readSettingData(key)) ?? {};
  await restoreSettingRaw(key, JSON.stringify({ version: 1, data: { ...current, ...patch } }));
}

/** Today in America/Mexico_City (the work-day time zone), shifted by `offsetDays`, as YYYY-MM-DD. */
export function mexicoDate(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = today.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays));
  return shifted.toISOString().slice(0, 10);
}

/** Injects axe-core and returns the serious and critical violations of the current page. */
export async function seriousAxeViolations(page: Page): Promise<{ id: string; impact: string; targets: string[] }[]> {
  await page.addScriptTag({ path: path.join(process.cwd(), "node_modules", "axe-core", "axe.min.js") });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: { id: string; impact: string | null; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(document, { resultTypes: ["violations"] });
    return result.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => ({ id: v.id, impact: v.impact as string, targets: v.nodes.map((n) => n.target.join(" ")) }));
  });
}

/** Asserts the page is clean of serious and critical axe violations. */
export async function expectAxeClean(page: Page, label: string): Promise<void> {
  const violations = await seriousAxeViolations(page);
  expect(violations, `axe violations on ${label}`).toEqual([]);
}

/** Whether the page renders with the appearance block and attributes of the root layout. */
export async function rendersNewShell(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.getElementById("appearance") !== null && document.documentElement.hasAttribute("data-theme-id"),
  );
}
