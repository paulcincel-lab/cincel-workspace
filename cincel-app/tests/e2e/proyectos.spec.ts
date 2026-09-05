/**
 * E2E: Proyectos — create a project and assert it persists in the list.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT_NAME = `Proyecto E2E ${RUN_ID}`;

test.describe("Proyectos — create and edit", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    // Wait for the exact Proyectos heading
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("create a project and verify it appears in the list", async ({ page }) => {
    await page.getByRole("button", { name: /Nuevo proyecto/i }).click();
    await page.getByRole("heading", { name: "Nuevo proyecto" }).waitFor({ state: "visible" });

    // The label wraps its input (implicit htmlFor association)
    await page.getByLabel("Nombre del proyecto").fill(PROJECT_NAME);

    await page.getByRole("button", { name: "Crear proyecto" }).click();

    // After creation the app navigates to the project's ficha page — the name
    // renders as a subtitle (<p>) under the static "Ficha del proyecto" <h1>,
    // not as its own heading.
    await expect(page.getByRole("heading", { name: "Ficha del proyecto" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(PROJECT_NAME).first()).toBeVisible({ timeout: 5_000 });

    // Navigate back to the list and verify the project persists (real localStorage)
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder(/filtrar/i).fill(PROJECT_NAME);
    await expect(page.getByText(PROJECT_NAME).first()).toBeVisible({ timeout: 15_000 });
  });
});
