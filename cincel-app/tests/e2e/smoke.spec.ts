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
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("login page fits a 390 px screen without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Correo institucional")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("denied page explains the refusal and links back to /login", async ({ page }) => {
    await page.goto(`${BASE_URL}/login/denegado?motivo=revoked&email=persona%40gmail.com`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("Tu acceso a Cincel fue retirado en Google Workspace.")).toBeVisible();
    const back = page.getByRole("link", { name: "Usar otra cuenta" });
    await expect(back).toHaveAttribute("href", "/login");
  });

  test("admin can log in and reach a private route", async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await expect(page).toHaveURL(/\/(dashboard|inicio|directorio|proyectos|tareas|equipo)/);
  });
});
