/**
 * E2E: Directorio — `/directorio` and `/clientes`, `/contratistas`,
 * `/proveedores` redirect to the Personas tabs (FE §2.2).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared
 * staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";
import { clearAppearanceCookie } from "./helpers/redesign";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

test.describe("Directorio", () => {
  test.beforeEach(async ({ page }) => {
    await clearAppearanceCookie(page.context());
    await loginAsAdmin(page, BASE_URL);
  });

  test("/directorio redirects to Personas · Clientes and lists a seeded client", async ({ page }) => {
    const clientName = `Cliente Personas E2E ${Date.now()}`;
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`insert into core.contacts (name, type) values (${clientName}, 'cliente')`;
    } finally {
      await sql.end();
    }

    await page.goto(`${BASE_URL}/directorio`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/personas\/clientes(\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible({ timeout: 30_000 });

    const tabs = page.getByRole("navigation", { name: "Secciones de Personas" });
    await expect(tabs.getByRole("link", { name: /^Clientes/ })).toHaveAttribute("aria-current", "page");
    // The legacy Directorio page (its h1 and "+ Nuevo contacto") is gone.
    await expect(page.getByRole("heading", { name: "Directorio", level: 1 })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Nuevo contacto" })).toHaveCount(0);
    await expect(page.getByText(clientName).first()).toBeVisible({ timeout: 30_000 });
  });

  for (const [legacy, tab, target] of [
    ["/clientes", "Clientes", "/personas/clientes"],
    ["/contratistas", "Contratistas", "/personas/contratistas"],
    ["/proveedores", "Proveedores", "/personas/proveedores"],
  ] as const) {
    test(`${legacy} redirects to the ${tab} tab`, async ({ page }) => {
      await page.goto(`${BASE_URL}${legacy}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(new RegExp(`${target}(\\?|$)`), { timeout: 15_000 });
      const tabs = page.getByRole("navigation", { name: "Secciones de Personas" });
      await expect(tabs.getByRole("link", { name: new RegExp(`^${tab}`) })).toHaveAttribute("aria-current", "page", {
        timeout: 30_000,
      });
    });
  }
});
