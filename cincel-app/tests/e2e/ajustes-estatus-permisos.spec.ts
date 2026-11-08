/**
 * E2E: Ajustes › Estatus and Ajustes › Permisos (redesign FE §3.8): the admin
 * manages custom statuses and the permissions editor there. `afterAll` resets
 * the admin's preferences.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";
import { BASE_URL, resetAdminPreferences, withDb } from "./helpers/redesign";

const RUN_ID = Date.now();
const STATUS_NAME = `Revisión ajustes E2E ${RUN_ID}`;
const PERMISSIONS_KEY = "cincel.permissions.custom.v1";

async function removeTestStatus(): Promise<void> {
  await withDb(async (sql) => {
    await sql`delete from core.task_statuses where name = ${STATUS_NAME}`;
  });
}

test.describe("Ajustes › Estatus y Permisos", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async () => {
    await resetAdminPreferences();
    await removeTestStatus();
  });

  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("custom statuses are grouped by base and created from their base", async ({ page }) => {
    await page.goto(`${BASE_URL}/ajustes/estatus`, { waitUntil: "domcontentloaded" });

    for (const base of ["Pendiente", "En proceso", "Completado", "Bloqueado"]) {
      await expect(page.getByRole("region", { name: base, exact: true })).toBeVisible({ timeout: 30_000 });
    }

    await page.getByRole("button", { name: "Agregar estatus en En proceso" }).click();
    const dialog = page.getByRole("dialog", { name: "Nuevo estatus" });
    await dialog.getByLabel("Nombre").fill(STATUS_NAME);
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 15_000 });

    const enProceso = page.getByRole("region", { name: "En proceso", exact: true });
    await expect(enProceso.getByRole("group", { name: STATUS_NAME })).toBeVisible({ timeout: 15_000 });

    // Editing "Cierra la tarea" moves it under Completado.
    await page.getByRole("button", { name: `Editar ${STATUS_NAME}` }).click();
    const editor = page.getByRole("dialog", { name: "Editar estatus" });
    await editor.getByRole("checkbox", { name: /Cierra la tarea/ }).click();
    await expect(editor.getByRole("switch", { name: /Cuenta como completada/ })).toBeChecked();
    await editor.getByRole("button", { name: "Guardar" }).click();
    const completado = page.getByRole("region", { name: "Completado", exact: true });
    await expect(completado.getByRole("group", { name: STATUS_NAME })).toBeVisible({ timeout: 15_000 });

    // Delete asks first.
    await page.getByRole("button", { name: `Eliminar ${STATUS_NAME}` }).click();
    const confirm = page.getByRole("dialog", { name: `¿Eliminar el estatus "${STATUS_NAME}"?` });
    await confirm.getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByRole("group", { name: STATUS_NAME })).toHaveCount(0, { timeout: 15_000 });
  });

  test("the permissions editor saves to the same browser storage", async ({ page }) => {
    await page.goto(`${BASE_URL}/ajustes/permisos`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("region", { name: "Personas por acceso" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("region", { name: "Permisos de Dirección" })).toBeVisible();

    await page.getByRole("button", { name: "Configurar Colaborador" }).click();
    await expect(page.getByRole("region", { name: "Permisos de Colaborador" })).toBeVisible();

    await page.getByRole("switch", { name: "Ver carga del equipo" }).click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Fuente actual: configuración personalizada.")).toBeVisible();
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), PERMISSIONS_KEY);
    expect(JSON.parse(stored ?? "null")?.version).toBe(1);

    await page.getByRole("button", { name: "Restaurar permisos por defecto" }).click();
    await expect(page.getByText("Fuente actual: valores por defecto.")).toBeVisible();
    expect(await page.evaluate((key) => window.localStorage.getItem(key), PERMISSIONS_KEY)).toBeNull();
  });

});
