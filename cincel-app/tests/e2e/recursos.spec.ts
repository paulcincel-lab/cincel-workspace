/**
 * E2E: Recursos — same card/tile layout as Empresa (#437): overview tiles
 * open a section page, where a resource can be added and edited.
 *
 * Redesign flag (FE §2.2, §2.3): with `redesign_enabled` off the legacy
 * `/recursos` renders as before (and the new-only `/biblioteca` sends you
 * back to it); with it on, `/recursos/*` redirects to `/biblioteca/*`.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin, e2eAdminEmail } from "./helpers/seed-auth";
import { clearAppearanceCookie, setRedesignFor } from "./helpers/redesign";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

test.describe("Recursos — card layout (redesign flag off)", () => {
  test.beforeAll(async () => {
    await setRedesignFor(e2eAdminEmail(), false);
  });
  test.afterAll(async () => {
    await setRedesignFor(e2eAdminEmail(), null);
  });

  test.beforeEach(async ({ page }) => {
    await clearAppearanceCookie(page.context());
  });

  test("the new-only /biblioteca routes send you back to /recursos", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/biblioteca`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/recursos(\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Carpetas principales" })).toBeVisible({ timeout: 30_000 });

    await page.goto(`${BASE_URL}/biblioteca/vacaciones`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/recursos\/mis-vacaciones(\?|$)/, { timeout: 15_000 });
  });

  test("overview tiles open a section where a resource can be added and edited", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/recursos`, { waitUntil: "domcontentloaded" });

    // Same overview as Empresa: section folders.
    await expect(page.getByRole("heading", { name: "Carpetas principales" })).toBeVisible({ timeout: 30_000 });

    // A section tile opens its own page (it used to 404).
    await page.getByRole("link", { name: /Plantillas de diseño/ }).first().click();
    await expect(page).toHaveURL(/\/recursos\/plantillas-diseno$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Plantillas de diseño", level: 1 })).toBeVisible({ timeout: 15_000 });

    const sheet = page.locator('[data-slot="sheet-content"]');
    const original = `Plantilla E2E ${RUN_ID}`;
    const renamed = `Plantilla renombrada E2E ${RUN_ID}`;

    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await sheet.locator("input").first().fill(original);
    await sheet.getByPlaceholder("https://...").fill("https://example.com/plantilla");
    await sheet.getByRole("button", { name: "Crear recurso" }).click();
    await expect(page.getByRole("button", { name: original })).toBeVisible({ timeout: 15_000 });

    // Editing — the table used to have this; the card layout now does too.
    await page.getByRole("button", { name: original }).click();
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await expect(sheet.getByText("Editar recurso")).toBeVisible();
    await sheet.locator("input").first().fill(renamed);
    await sheet.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("button", { name: renamed })).toBeVisible({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: renamed })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: original })).toHaveCount(0);

    // An unknown section renders the not-found page, not a blank workspace.
    // (Streaming responses keep HTTP 200 — same as /actividades/<unknown>.)
    await page.goto(`${BASE_URL}/recursos/no-existe`);
    await expect(page.getByText("This page could not be found")).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Recursos — redesign flag on", () => {
  test.beforeAll(async () => {
    await setRedesignFor(e2eAdminEmail(), true);
  });
  test.afterAll(async () => {
    await setRedesignFor(e2eAdminEmail(), null);
  });

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
