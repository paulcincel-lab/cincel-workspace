/**
 * Route states (redesign FE §3.12): the staff not-found page.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Estados — página no encontrada", () => {
  test("an unknown URL shows the not-found page with a way back", async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);

    const response = await page.goto(`${BASE_URL}/esta-pagina-no-existe`, { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(404);

    await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    const home = page.getByRole("link", { name: "Volver a Inicio" });
    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute("href", "/inicio");
  });
});
