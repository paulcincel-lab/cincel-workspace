/**
 * E2E: custom task statuses are statuses of their own — created without a
 * base status, shown as their own Tablero column, optionally closing tasks.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";
import { resetAdminPreferences } from "./helpers/redesign";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();

test.describe("Estatus propios de tareas — nuevo diseño", () => {
  const NEW_STATUS = `Validación E2E ${RUN_ID}`;

  test.afterAll(resetAdminPreferences);

  test("/configuracion/estatus opens Ajustes › Estatus, where a status is created", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/configuracion/estatus`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/ajustes\/estatus$/, { timeout: 15_000 });

    await page.getByRole("button", { name: "+ Nuevo estatus" }).click();
    await page.getByLabel("Nombre").fill(NEW_STATUS);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("row").filter({ hasText: NEW_STATUS })).toBeVisible({ timeout: 15_000 });
  });
});
