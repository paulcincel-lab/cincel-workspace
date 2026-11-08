/**
 * E2E: Equipo — `/equipo` redirects to `/personas` (FE §2.2).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";
import { clearAppearanceCookie } from "./helpers/redesign";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

test.describe("Equipo", () => {
  test.beforeEach(async ({ page }) => {
    await clearAppearanceCookie(page.context());
    await loginAsAdmin(page, BASE_URL);
  });

  test("/equipo redirects to the Personas · Equipo tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/equipo`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/personas(\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible({ timeout: 30_000 });

    const tabs = page.getByRole("navigation", { name: "Secciones de Personas" });
    await expect(tabs.getByRole("link", { name: /^Equipo/ })).toHaveAttribute("aria-current", "page");
    for (const tab of ["Clientes", "Contratistas", "Proveedores"]) {
      await expect(tabs.getByRole("link", { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
    // The legacy page (its own header and "Agregar colaborador") is gone.
    await expect(page.getByRole("button", { name: /Agregar colaborador/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Agregar persona" })).toBeVisible();
  });

  test("the redirect keeps the query string", async ({ page }) => {
    await page.goto(`${BASE_URL}/equipo?estilo=analitico`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/personas\?(.*&)?estilo=analitico/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible({ timeout: 30_000 });
  });

  test("a seeded collaborator is listed and opens its persona detail", async ({ page }) => {
    const name = `Persona E2E ${Date.now()}`;
    const sql = postgres(connectionString, { max: 1 });
    const id = await (async () => {
      try {
        const [member] = await sql`
          insert into core.staff (name, kind, capacity) values (${name}, 'empleado', 5) returning id`;
        return member.id as string;
      } finally {
        await sql.end();
      }
    })();

    await page.goto(`${BASE_URL}/equipo`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/personas(\?|$)/, { timeout: 15_000 });
    const link = page.getByRole("link", { name }).first();
    await expect(link).toBeVisible({ timeout: 30_000 });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/personas/equipo/${id}`), { timeout: 15_000 });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
  });
});
