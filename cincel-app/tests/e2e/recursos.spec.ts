/**
 * E2E: Recursos — same card/tile layout as Empresa (#437): overview tiles
 * open a section page, where a resource can be added and edited.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();

test.describe("Recursos — card layout", () => {
  test("overview tiles open a section where a resource can be added and edited", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/recursos`, { waitUntil: "domcontentloaded" });

    // Same overview as Empresa: section folders.
    await expect(page.getByRole("heading", { name: "Carpetas principales" })).toBeVisible({ timeout: 30_000 });

    // A section tile opens its own page (it used to 404).
    await page.getByRole("link", { name: /Plantillas de diseño/ }).first().click();
    await expect(page).toHaveURL(/\/recursos\/plantillas-diseno$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Plantillas de diseño", level: 1 })).toBeVisible({ timeout: 15_000 });

    const sheet = page.locator('[data-slot="sheet-content"]');
    const original = `Plantilla E2E ${RUN_ID}`;
    const renamed = `Plantilla renombrada E2E ${RUN_ID}`;

    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await sheet.locator("input").first().fill(original);
    await sheet.getByPlaceholder("https://...").fill("https://example.com/plantilla");
    await sheet.getByRole("button", { name: "Crear recurso" }).click();
    await expect(page.getByRole("button", { name: original })).toBeVisible({ timeout: 15_000 });

    // Editing — the table used to have this; the card layout now does too.
    await page.getByRole("button", { name: original }).click();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(sheet.getByText("Editar recurso")).toBeVisible();
    await sheet.locator("input").first().fill(renamed);
    await sheet.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("button", { name: renamed })).toBeVisible({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: renamed })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: original })).toHaveCount(0);

    // An unknown section renders the not-found page, not a blank workspace.
    // (Streaming responses keep HTTP 200 — same as /actividades/<unknown>.)
    await page.goto(`${BASE_URL}/recursos/no-existe`);
    await expect(page.getByText("This page could not be found")).toBeVisible({ timeout: 15_000 });
  });
});
