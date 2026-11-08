/**
 * E2E: old route stubs (FE §2.2): every old route redirects server-side to
 * its new route with the query string preserved.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

/** Old URL → new URL (FE §2.2). */
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

function pathAndQuery(page: Page): string {
  const url = new URL(page.url());
  return `${url.pathname}${url.search}`;
}

test.describe("Old route redirects", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("every old route redirects with its query preserved", async ({ page }) => {
    for (const [from, to] of REDIRECTS) {
      await page.goto(`${BASE_URL}${from}`, { waitUntil: "domcontentloaded" });
      expect(pathAndQuery(page), from).toBe(to);
    }
  });
});
