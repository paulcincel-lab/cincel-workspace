/**
 * E2E: Personas · Equipo (redesign FE §3.6).
 *
 * /personas shows the "Personas" header, the four tabs as links with counts
 * and the "Agregar persona" editor; the Cutto chat is a link that opens a new
 * tab.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test.describe.serial("Personas · Equipo", () => {
  test("/personas shows the header, tabs with counts and the editor", async ({ page }) => {
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
