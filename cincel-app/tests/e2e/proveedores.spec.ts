/**
 * E2E: Proveedores (contratistas) — create a contractor and assert it persists
 * to Postgres across a reload. Representative of the providers slice
 * (contractors / colaboradores / tiendas share the repository + action shape).
 *
 * IMPORTANT: Run only against an ephemeral or local environment.
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROVIDER_NAME = `Proveedor E2E ${RUN_ID}`;

test.describe("Proveedores — contratistas persistence", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/proveedores/contratistas`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("button", { name: /Agregar proveedor/i }).first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test("create a contractor and verify it persists after reload", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Agregar proveedor/i }).first().click();

    const modal = page.locator("div.fixed").filter({
      has: page.getByRole("heading", { name: "Agregar Proveedor" }),
    });
    await modal
      .getByRole("heading", { name: "Agregar Proveedor" })
      .waitFor({ state: "visible", timeout: 15_000 });

    await modal.getByPlaceholder("Ej. Carpintero Juan Pérez").fill(PROVIDER_NAME);
    await modal.getByRole("button", { name: "Agregar proveedor" }).click();

    await page
      .getByRole("heading", { name: "Agregar Proveedor" })
      .waitFor({ state: "hidden", timeout: 15_000 });

    await page.getByPlaceholder(/Buscar proveedor/i).fill(PROVIDER_NAME);
    await expect(
      page.getByRole("cell", { name: PROVIDER_NAME })
    ).toBeVisible({ timeout: 15_000 });

    // Reload → confirm it came back from Postgres.
    await page.goto(`${BASE_URL}/proveedores/contratistas`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("button", { name: /Agregar proveedor/i }).first()
    ).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/Buscar proveedor/i).fill(PROVIDER_NAME);
    await expect(
      page.getByRole("cell", { name: PROVIDER_NAME })
    ).toBeVisible({ timeout: 15_000 });
  });
});
