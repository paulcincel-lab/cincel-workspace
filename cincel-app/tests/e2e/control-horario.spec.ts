/**
 * E2E: Control de horario (redesign Phase 6; FE §3.8, §3.10, §3.13, §18 item 9; BE §7.7).
 *
 * 1. The admin turns it on in Ajustes › Control de horario ("Guardar cambios").
 * 2. A staff member signs in: the login prompt is optional ("Ahora no"); the sidebar `TimeClock` then
 *    walks Registrar entrada → Pausa → Reanudar → Salida, and the entry is stored closed by the user
 *    with one pause; Perfil shows "Mis horas esta semana".
 * 3. The admin sets "Obligatorio a partir de" to tomorrow: the prompt is still optional and says
 *    "Opcional hasta el …".
 * 4. Once that date arrives (simulated by moving `requiredFrom` to today in the DB, since the UI only
 *    accepts tomorrow or later), the prompt is mandatory: no "Ahora no", Escape and an outside click
 *    do not close it, and "Registrar entrada" clocks in from the prompt (`source = 'login'`).
 * 5. Escape hatch: when clocking in fails with `DISABLED` (the admin turned it off meanwhile), the
 *    error copy shows and "Cerrar" appears, so nobody is locked out.
 *
 * Every work day is enabled for the run so the prompt shows any day of the week. The org settings row
 * is snapshotted before and put back afterwards; the staff member (and its entries) is an E2E row.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";
import {
  BASE_URL,
  createStaffUser,
  mexicoDate,
  patchSettingData,
  readSettingRaw,
  resetAdminPreferences,
  restoreSettingRaw,
  signedInContext,
  withDb,
  type E2EUser,
} from "./helpers/redesign";

const SETTINGS_KEY = "time_tracking";
const PROMPT_COPY = "Registra tu entrada para empezar el día.";

type EntryRow = { source: string; ended: boolean; closedBy: string | null; pauses: number };

async function entriesOf(staffId: string): Promise<EntryRow[]> {
  return withDb(async (sql) => {
    const rows = await sql`
      select source, ended_at is not null as ended, closed_by, jsonb_array_length(pauses) as pauses
      from core.time_entries where staff_id = ${staffId} order by started_at`;
    return rows.map((r) => ({
      source: r.source as string,
      ended: r.ended as boolean,
      closedBy: (r.closed_by as string | null) ?? null,
      pauses: Number(r.pauses),
    }));
  });
}

async function clearEntries(staffId: string): Promise<void> {
  await withDb((sql) => sql`delete from core.time_entries where staff_id = ${staffId}`);
}

const prompt = (page: Page) => page.getByRole("dialog").filter({ hasText: PROMPT_COPY });

/** Signs the worker in on a fresh context, so the prompt counts this as the day's first staff page. */
async function workerSession(browser: Browser, worker: E2EUser) {
  return signedInContext(browser, worker);
}

async function openHorario(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/ajustes/horario`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("switch", { name: /Control de horario/ })).toBeVisible({ timeout: 30_000 });
}

async function saveHorario(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Guardar cambios" }).click();
}

test.describe("Control de horario", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  let snapshot: string | null = null;
  let worker: E2EUser;

  test.beforeAll(async () => {
    snapshot = await readSettingRaw(SETTINGS_KEY);
    await patchSettingData(SETTINGS_KEY, {
      enabled: false,
      requiredFrom: null,
      workDays: [0, 1, 2, 3, 4, 5, 6],
      promptAtLogin: true,
      exemptRoles: [],
    });
    worker = await createStaffUser({ tag: "Jornada", role: "Colaborador" });
  });

  test.afterAll(async () => {
    await restoreSettingRaw(SETTINGS_KEY, snapshot);
    await resetAdminPreferences();
  });

  test("the admin turns Control de horario on", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await openHorario(page);
    const toggle = page.getByRole("switch", { name: /Control de horario/ });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await saveHorario(page);

    await expect
      .poll(async () => withDb(async (sql) => {
        const [row] = await sql`select value from core.app_settings where key = ${SETTINGS_KEY}`;
        return (JSON.parse(row.value as string) as { data: { enabled: boolean } }).data.enabled;
      }), { timeout: 15_000 })
      .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("switch", { name: /Control de horario/ })).toBeChecked({ timeout: 30_000 });
  });

  test("clock in, pause, resume and clock out from the sidebar", async ({ browser }) => {
    await clearEntries(worker.staffId);
    const { context, page } = await workerSession(browser, worker);
    try {
      // Optional prompt (no requiredFrom): "Ahora no" closes it.
      await expect(prompt(page)).toBeVisible({ timeout: 30_000 });
      await prompt(page).getByRole("button", { name: "Ahora no" }).click();
      await expect(prompt(page)).toHaveCount(0);

      // Sidebar clock: Sin iniciar → En curso → En pausa → En curso → Cerrada.
      await expect(page.getByRole("timer").first()).toBeVisible();
      await expect(page.getByText("Sin iniciar").first()).toBeVisible();
      await page.getByRole("button", { name: "Registrar entrada" }).first().click();
      await expect(page.getByText("En curso").first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Pausa" }).first()).toBeVisible();

      await page.getByRole("button", { name: "Pausa" }).first().click();
      await expect(page.getByText("En pausa").first()).toBeVisible({ timeout: 15_000 });
      await page.getByRole("button", { name: "Reanudar" }).first().click();
      await expect(page.getByText("En curso").first()).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Salida" }).first().click();
      await expect(page.getByText("Cerrada").first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "Registrar entrada" }).first()).toBeVisible();

      await expect.poll(() => entriesOf(worker.staffId), { timeout: 15_000 }).toEqual([
        { source: "sidebar", ended: true, closedBy: "user", pauses: 1 },
      ]);

      // Perfil shows the week's hours while the feature is on.
      await page.goto(`${BASE_URL}/ajustes/perfil`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Mis horas esta semana").first()).toBeVisible({ timeout: 30_000 });
    } finally {
      await context.close();
    }
  });

  test("before the required date the prompt stays optional", async ({ page, browser }) => {
    const tomorrow = mexicoDate(1);
    await loginAsAdmin(page, BASE_URL);
    await openHorario(page);
    await page.getByLabel("Obligatorio a partir de").fill(tomorrow);
    await saveHorario(page);
    await expect
      .poll(async () => withDb(async (sql) => {
        const [row] = await sql`select value from core.app_settings where key = ${SETTINGS_KEY}`;
        return (JSON.parse(row.value as string) as { data: { requiredFrom: string | null } }).data.requiredFrom;
      }), { timeout: 15_000 })
      .toBe(tomorrow);

    await clearEntries(worker.staffId);
    const { context, page: workerPage } = await workerSession(browser, worker);
    try {
      const dialog = prompt(workerPage);
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByText(/Opcional hasta el/)).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Ahora no" })).toBeVisible();
      // Optional: Escape dismisses it.
      await workerPage.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(workerPage.getByText(/Opcional hasta el/).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("from the required date on the prompt is mandatory and clocks in from login", async ({ browser }) => {
    // The UI accepts only tomorrow or later; move the date to today as if it had arrived.
    await patchSettingData(SETTINGS_KEY, { enabled: true, requiredFrom: mexicoDate(0) });
    await clearEntries(worker.staffId);

    const { context, page } = await workerSession(browser, worker);
    try {
      const dialog = prompt(page);
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByRole("button", { name: "Ahora no" })).toHaveCount(0);
      await expect(dialog.getByText(/Opcional hasta el/)).toHaveCount(0);

      // Neither Escape nor a click outside closes it.
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
      await page.mouse.click(4, 4);
      await expect(dialog).toBeVisible();

      await dialog.getByRole("button", { name: "Registrar entrada" }).click();
      await expect(dialog).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByText("En curso").first()).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => entriesOf(worker.staffId), { timeout: 15_000 }).toEqual([
        { source: "login", ended: false, closedBy: null, pauses: 0 },
      ]);

      await page.getByRole("button", { name: "Salida" }).first().click();
      await expect(page.getByText("Cerrada").first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  test("a mandatory prompt can be closed after a DISABLED error", async ({ browser }) => {
    await patchSettingData(SETTINGS_KEY, { enabled: true, requiredFrom: mexicoDate(0) });
    await clearEntries(worker.staffId);

    const { context, page } = await workerSession(browser, worker);
    try {
      const dialog = prompt(page);
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByRole("button", { name: "Cerrar" })).toHaveCount(0);

      // The admin turns the feature off while the prompt is open.
      await patchSettingData(SETTINGS_KEY, { enabled: false });
      await dialog.getByRole("button", { name: "Registrar entrada" }).click();
      await expect(dialog.getByText("Esta función está desactivada.")).toBeVisible({ timeout: 15_000 });
      await dialog.getByRole("button", { name: "Cerrar" }).click();
      await expect(dialog).toHaveCount(0);
      expect(await entriesOf(worker.staffId)).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
