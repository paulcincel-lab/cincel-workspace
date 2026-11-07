/**
 * E2E: legacy route stubs of the redesign (FE §2.2, §2.3). With the flag off
 * every legacy route stays in the legacy UI; after opting in from the legacy
 * dashboard every legacy route redirects server-side to its new route with the
 * query string preserved. The spec opts back out at the end so the other specs
 * keep running against the legacy UI.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

/** Legacy URL → new URL with the flag on (FE §2.2). */
const REDIRECTS: [from: string, to: string][] = [
  ["/", "/inicio"],
  ["/dashboard?tab=kpis", "/inicio?tab=kpis"],
  ["/tablero?proyecto=p1", "/tareas?vista=tablero&proyecto=p1"],
  ["/mis-tareas", "/tareas?vista=lista&responsable=yo"],
  ["/calendario", "/tareas?vista=calendario"],
  ["/actividades/general", "/tareas?vista=lista"],
  ["/actividades/presale", "/tareas?vista=lista&tramo=presale"],
  ["/actividades/presale?project=X", "/tareas?vista=lista&tramo=presale&project=X&iniciar=1"],
  ["/equipo", "/personas"],
  ["/directorio?q=ana", "/personas/clientes?q=ana"],
  ["/clientes", "/personas/clientes"],
  ["/contratistas", "/personas/contratistas"],
  ["/proveedores/colaboradores", "/personas/proveedores"],
  ["/proveedores/contratistas", "/personas/proveedores"],
  ["/proveedores/tiendas", "/personas/proveedores"],
  ["/recursos", "/biblioteca"],
  ["/recursos/formacion", "/biblioteca/formacion"],
  ["/recursos/mis-vacaciones", "/biblioteca/vacaciones"],
  ["/recursos/empresa", "/biblioteca"],
  ["/recursos/empresa/manual-de-la-empresa", "/biblioteca/empresa/manual-de-la-empresa"],
  ["/profile", "/ajustes/perfil"],
  ["/configuracion", "/ajustes/apariencia"],
  ["/configuracion/workflows", "/ajustes/tramos"],
  ["/configuracion/areas", "/ajustes/puestos"],
  ["/configuracion/permisos", "/ajustes/permisos"],
  ["/configuracion/importar-monday", "/ajustes/monday"],
  ["/configuracion/google/primeros-pasos", "/ajustes/google/primeros-pasos"],
];

/** Paths only the redesign serves; a flag-off visit to a legacy route never lands on one. */
const NEW_ONLY = /^\/(inicio|mi-espacio|tareas|personas|biblioteca|ajustes)(\/|$)/;

function pathAndQuery(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

async function optOut(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "load" });
  const menu = page.getByRole("button", { name: /^Menú de la cuenta de / });
  if (!(await menu.isVisible().catch(() => false))) return;
  await menu.click();
  await page.getByRole("menuitem", { name: "Volver al diseño anterior" }).click();
  await expect(menu).toBeHidden({ timeout: 15_000 });
}

test.describe("Redesign — legacy route redirects", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test.afterEach(async ({ page }) => {
    // Best effort: leave the admin on the legacy UI for the next specs.
    await optOut(page).catch(() => undefined);
  });

  test("with the flag off, legacy routes stay in the legacy UI", async ({ page }) => {
    for (const [from] of REDIRECTS) {
      await page.goto(`${BASE_URL}${from}`, { waitUntil: "domcontentloaded" });
      expect(new URL(page.url()).pathname, from).not.toMatch(NEW_ONLY);
    }
  });

  test("with the flag on, every legacy route redirects with its query preserved", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "load" });
    await expect(page.getByText("Prueba el nuevo diseño")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Activar", exact: true }).click();
    // The refresh re-renders /dashboard on the server, which now redirects.
    await page.waitForURL(`${BASE_URL}/inicio`, { timeout: 20_000 });

    for (const [from, to] of REDIRECTS) {
      await page.goto(`${BASE_URL}${from}`, { waitUntil: "domcontentloaded" });
      expect(pathAndQuery(page), from).toBe(to);
    }
  });
});
