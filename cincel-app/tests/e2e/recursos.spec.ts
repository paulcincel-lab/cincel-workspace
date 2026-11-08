/**
 * E2E: Recursos — `/recursos/*` redirects to `/biblioteca/*` (FE §2.2), where
 * a resource added to a section shows.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";
import { clearAppearanceCookie } from "./helpers/redesign";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

test.describe("Recursos", () => {
  test.beforeEach(async ({ page }) => {
    await clearAppearanceCookie(page.context());
    await loginAsAdmin(page, BASE_URL);
  });

  test("/recursos redirects to the Biblioteca with its Empresa and Recursos catalog", async ({ page }) => {
    await page.goto(`${BASE_URL}/recursos`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/biblioteca(\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Biblioteca", level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Empresa", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recursos", level: 2 })).toBeVisible();
    await expect(page.getByText("Manual de la empresa").first()).toBeVisible();
    await expect(page.getByText("Plantillas de diseño").first()).toBeVisible();
    // The legacy workspace is gone.
    await expect(page.getByRole("heading", { name: "Carpetas principales" })).toHaveCount(0);
  });

  test("section, company document and mis-vacaciones routes map to their Biblioteca targets", async ({ page }) => {
    await page.goto(`${BASE_URL}/recursos/plantillas-diseno`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/biblioteca\/plantillas-diseno(\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Plantillas de diseño", level: 1 })).toBeVisible({ timeout: 30_000 });

    await page.goto(`${BASE_URL}/recursos/empresa/manual-de-la-empresa`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/biblioteca\/empresa\/manual-de-la-empresa(\?|$)/, { timeout: 15_000 });

    await page.goto(`${BASE_URL}/recursos/empresa`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/biblioteca(\?|$)/, { timeout: 15_000 });

    await page.goto(`${BASE_URL}/recursos/mis-vacaciones`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/biblioteca\/vacaciones(\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Mis vacaciones", level: 1 })).toBeVisible({ timeout: 30_000 });
  });

  test("a resource added to a Biblioteca section shows there", async ({ page }) => {
    const title = `Recurso Biblioteca E2E ${RUN_ID}`;
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`
        insert into core.resource_links (title, url, section, link_type)
        values (${title}, 'https://example.com/recurso-e2e', 'plantillas-diseno', 'web')`;
    } finally {
      await sql.end();
    }

    await page.goto(`${BASE_URL}/biblioteca/plantillas-diseno`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
  });
});
