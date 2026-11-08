/**
 * E2E: sign in through the real login form and land on Inicio (redesign FE
 * §3.2). `/dashboard` redirects to `/inicio`, which greets the viewer by hour.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;

test.describe("Acceso — login e Inicio", () => {
  test("an admin signs in and lands on Inicio", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);

    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/inicio/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^(Buenos días|Buenas tardes|Buenas noches)/ })).toBeVisible({
      timeout: 30_000,
    });
  });
});
