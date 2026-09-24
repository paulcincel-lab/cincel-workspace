/**
 * E2E: the company primary color (#459) — picked from the Tailwind palette in
 * Configuración → General, stored in Postgres and applied app-wide.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import colors from "tailwindcss/colors";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Apariencia — color principal", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("picking a color applies it after reload, and Restaurar goes back to black", async ({ page }) => {
    const primary = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());

    await page.goto(`${BASE_URL}/configuracion/general`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Elegir color principal" }).click();
    await page.getByRole("button", { name: "blue-700", exact: true }).click();
    await expect(page.getByRole("button", { name: "Elegir color principal" })).toContainText("blue-700", {
      timeout: 15_000,
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(primary).toBe(colors.blue[700]);

    await page.getByRole("button", { name: "Restaurar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Elegir color principal" })).toContainText("Predeterminado", {
      timeout: 15_000,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(primary).not.toBe(colors.blue[700]);
  });
});
