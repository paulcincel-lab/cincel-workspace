/**
 * E2E: Inicio (redesign FE §3.2): `/dashboard` redirects to `/inicio`, which
 * greets the viewer and opens the new-task dialog from "Nueva tarea".
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("Inicio", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("/dashboard redirects to /inicio, which greets the viewer by hour", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/inicio/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /^(Buenos días|Buenas tardes|Buenas noches)/ })).toBeVisible({
      timeout: 30_000,
    });
    // The legacy page is gone from the new shell.
    await expect(page.getByRole("heading", { name: "Dashboard ejecutivo" })).toHaveCount(0);
  });

  test("\"Nueva tarea\" opens the new-task dialog on /tareas?nueva=1", async ({ page }) => {
    await page.goto(`${BASE_URL}/inicio`, { waitUntil: "domcontentloaded" });
    const nueva = page
      .getByRole("link", { name: "Nueva tarea", exact: true })
      .or(page.getByRole("button", { name: "Nueva tarea", exact: true }))
      .first();
    await expect(nueva).toBeVisible({ timeout: 30_000 });
    await nueva.click();
    await expect(page).toHaveURL(/\/tareas\?(.*&)?nueva=1/, { timeout: 30_000 });
    await expect(page.getByRole("dialog").getByText("Nueva tarea").first()).toBeVisible({ timeout: 15_000 });
  });
});
