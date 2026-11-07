/**
 * E2E: "Mostrar versión en la interfaz" (Configuración → General) hides and
 * shows the version in the sidebar footer.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";
import { ADMIN_EMAIL, resetAdminPreferences, setRedesignFor } from "./helpers/redesign";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Versión en la interfaz", () => {
  test.beforeAll(() => setRedesignFor(ADMIN_EMAIL, false));

  test("the switch hides and shows the sidebar version", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/configuracion/general`, { waitUntil: "load" });

    // Release builds show their own version, dev/CI builds the settings text.
    const version = page.getByText(/^v\d+\.\d+\.\d+/);
    await expect(version).toBeVisible({ timeout: 15_000 });

    const toggle = page.getByRole("switch", { name: /Mostrar versión en la interfaz/ });
    await toggle.click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(version).toHaveCount(0);

    await toggle.click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(version).toBeVisible();
  });
});

test.describe("Versión en la interfaz — nuevo diseño", () => {
  test.beforeAll(() => setRedesignFor(ADMIN_EMAIL, true));
  test.afterAll(resetAdminPreferences);

  test("/configuracion/general opens Ajustes › General and the switch persists", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/configuracion/general`, { waitUntil: "load" });
    await expect(page).toHaveURL(/\/ajustes\/general$/, { timeout: 15_000 });

    const toggle = page.getByRole("switch", { name: /Mostrar versión en la interfaz/ });
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    const initial = await toggle.isChecked();

    await toggle.click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("switch", { name: /Mostrar versión en la interfaz/ })).toBeChecked({
      checked: !initial,
      timeout: 30_000,
    });

    // Put it back.
    await page.getByRole("switch", { name: /Mostrar versión en la interfaz/ }).click();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await page.reload({ waitUntil: "load" });
    await expect(page.getByRole("switch", { name: /Mostrar versión en la interfaz/ })).toBeChecked({
      checked: initial,
      timeout: 30_000,
    });
  });
});
