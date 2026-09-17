/**
 * E2E: Proyectos — create a project and assert it persists in the list.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT_NAME = `Proyecto E2E ${RUN_ID}`;
const CLIENT_NAME = `Cliente E2E ${RUN_ID}`;

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

// A project always belongs to a client (see AGENTS.md — "Cada proyecto
// pertenece a un cliente"), so the label wraps a Select, not a plain input.
function fieldContainer(page: Page, labelText: string) {
  return page.locator("label").filter({ hasText: labelText }).last();
}

/** Seeds a client contact directly (skips the directorio UI, out of scope here). */
async function seedClient(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'empresa', ${CLIENT_NAME})
    `;
  } finally {
    await sql.end();
  }
}

test.describe("Proyectos — create and edit", () => {
  test.beforeEach(async ({ page }) => {
    await seedClient();
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

    // Cliente is required — a project always belongs to a client — so pick
    // the seeded client from the combobox before submitting.
    await fieldContainer(page, "Cliente").getByRole("combobox").click();
    await page.getByRole("option", { name: CLIENT_NAME }).click();

    await page.getByRole("button", { name: "Crear proyecto" }).click();

    // After creation the app navigates to the project's ficha page — the
    // project name itself renders as the page's <h1>, there is no separate
    // static "Ficha del proyecto" heading.
    await expect(page).toHaveURL(/\/proyectos\/[^/]+\/ficha$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: PROJECT_NAME })).toBeVisible({ timeout: 20_000 });

    // Navigate back to the list and verify the project persists (real localStorage)
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder(/filtrar/i).fill(PROJECT_NAME);
    await expect(page.getByText(PROJECT_NAME).first()).toBeVisible({ timeout: 15_000 });
  });
});
