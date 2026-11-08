/**
 * E2E: Control de horario (redesign Phase 6; FE §3.8, §3.10, §3.13; BE §7.7).
 *
 * The admin turns it on in Ajustes › Control de horario ("Guardar cambios"). A staff member then signs
 * in: the optional login prompt closes with "Ahora no", and the sidebar `TimeClock` walks
 * Registrar entrada → Pausa → Reanudar → Salida; the entry is stored closed by the user with one pause.
 *
 * Every work day is enabled for the run so the prompt shows any day of the week. The org settings row
 * is snapshotted before and put back afterwards; the staff member (and its entries) is an E2E row.
 * Runs in the `org-settings` project (playwright.config.ts): while it is on, every sign-in gets the prompt.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";
import {
  BASE_URL,
  createStaffUser,
  patchSettingData,
  readSettingRaw,
  resetAdminPreferences,
  restoreSettingRaw,
  signedInContext,
  withDb,
  type E2EUser,
} from "./helpers/redesign";

const SETTINGS_KEY = "time_tracking";
/** The switch's accessible name (`aria-label` in `HorarioControl`). */
const SWITCH_NAME = "Activar control de horario";
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
  await expect(page.getByRole("switch", { name: SWITCH_NAME })).toBeVisible({ timeout: 30_000 });
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
    const toggle = page.getByRole("switch", { name: SWITCH_NAME });
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
    await expect(page.getByRole("switch", { name: SWITCH_NAME })).toBeChecked({ timeout: 30_000 });
  });

  test("clock in, pause, resume and clock out from the sidebar", async ({ browser }) => {
    await clearEntries(worker.staffId);
    const { context, page } = await workerSession(browser, worker);
    try {
      // Optional prompt (no requiredFrom): "Ahora no" closes it.
      await expect(prompt(page)).toBeVisible({ timeout: 30_000 });
      await prompt(page).getByRole("button", { name: "Ahora no" }).click();
      await expect(prompt(page)).toHaveCount(0);

      // Every clock write is one `next-action` POST and no RSC request: the result goes into qk.me.today.
      const rscRequests: string[] = [];
      const actionPosts: string[] = [];
      page.on("request", (request) => {
        const headers = request.headers();
        if (headers["rsc"] === "1" || new URL(request.url()).searchParams.has("_rsc")) rscRequests.push(request.url());
        if (request.method() === "POST" && headers["next-action"]) actionPosts.push(request.url());
      });

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
      expect(rscRequests).toEqual([]);
      expect(actionPosts).toHaveLength(4);

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
});
