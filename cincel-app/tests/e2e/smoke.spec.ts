/**
 * Smoke test: verifies the login flow and basic navigation work end-to-end.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Smoke — login and navigation", () => {
  test("login page renders", async ({ page }) => {
    await seedAuth(page);
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Correo institucional")).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test("admin can log in and reach a private route", async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await expect(page).toHaveURL(/\/(dashboard|directorio|proyectos|tareas|equipo)/);
  });
});
