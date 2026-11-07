/**
 * E2E: Personas · Equipo (redesign FE §3.6).
 *
 * - Flag off (default): the legacy /equipo page renders as today.
 * - Flag on (the admin's `user_preferences.redesign_enabled`): /personas shows
 *   the "Personas" header, the four tabs as links with counts and the
 *   "Agregar persona" editor; the Cutto chat is a link that opens a new tab.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx";
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

/** Sets (or clears, with null) the admin's redesign preference. */
async function setAdminRedesign(enabled: boolean | null): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [admin] = await sql`
      select id from core.staff where lower(email) = lower(${ADMIN_EMAIL}) and deleted_at is null limit 1`;
    if (!admin) throw new Error(`seeded admin ${ADMIN_EMAIL} not found`);
    await sql`
      insert into core.user_preferences (staff_id, redesign_enabled)
      values (${admin.id}, ${enabled})
      on conflict (staff_id) do update set redesign_enabled = excluded.redesign_enabled`;
  } finally {
    await sql.end();
  }
}

test.describe.serial("Personas · Equipo", () => {
  test.afterAll(async () => {
    await setAdminRedesign(null);
  });

  test("flag off: /equipo renders the legacy page unchanged", async ({ page }) => {
    await setAdminRedesign(false);
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/equipo`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/equipo/);
    await expect(page.getByRole("button", { name: /Agregar colaborador/i })).toBeVisible({ timeout: 30_000 });
  });

  test("flag on: /personas shows the header, tabs with counts and the editor", async ({ page }) => {
    await setAdminRedesign(true);
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/personas`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Personas" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Equipo interno y directorio externo en un solo lugar.")).toBeVisible();

    const tabs = page.getByRole("navigation", { name: "Secciones de Personas" });
    await expect(tabs.getByRole("link", { name: /^Equipo\s*\d+$/ })).toHaveAttribute("aria-current", "page");
    for (const label of ["Clientes", "Contratistas", "Proveedores"]) {
      await expect(tabs.getByRole("link", { name: new RegExp(`^${label}\\s*\\d+$`) })).toBeVisible();
    }

    // A ?estilo= override is kept on every tab link.
    await page.goto(`${BASE_URL}/personas?estilo=analitico`, { waitUntil: "domcontentloaded" });
    await expect(tabs.getByRole("link", { name: /^Clientes/ })).toHaveAttribute(
      "href",
      "/personas/clientes?estilo=analitico",
    );

    // Cutto appears only as links that open a new tab.
    const cutto = page.getByRole("link", { name: /Abrir chat en Cutto/ });
    for (const link of await cutto.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }

    await page.getByRole("button", { name: "Agregar persona" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});
