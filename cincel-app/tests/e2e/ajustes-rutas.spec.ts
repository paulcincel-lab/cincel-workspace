/**
 * E2E: the Ajustes routes (redesign Phase 6, FE §2.2, §3.8, §8): every old Configuración / Perfil route
 * redirects to its `/ajustes/*` home, which renders inside `AppShell`; each admin segment is guarded on
 * the server (404 for a viewer without its capability) and `AjustesNav` lists only the segments the
 * viewer can open; Dirección reaches the hours report only.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";
import {
  ADMIN_EMAIL,
  BASE_URL,
  createStaffUser,
  rendersNewShell,
  resetAdminPreferences,
  signedInContext,
  type E2EUser,
} from "./helpers/redesign";

/** FE §2.2: old route → new route. */
const REDIRECTS: [from: string, to: string][] = [
  ["/configuracion", "/ajustes/apariencia"],
  ["/configuracion/general", "/ajustes/general"],
  ["/configuracion/estatus", "/ajustes/estatus"],
  ["/configuracion/permisos", "/ajustes/permisos"],
  ["/configuracion/tramos", "/ajustes/tramos"],
  ["/configuracion/puestos", "/ajustes/puestos"],
  ["/configuracion/workflows", "/ajustes/tramos"],
  ["/configuracion/areas", "/ajustes/puestos"],
  ["/configuracion/importar-monday", "/ajustes/monday"],
  ["/configuracion/google", "/ajustes/google"],
  ["/profile", "/ajustes/perfil"],
  ["/ajustes", "/ajustes/apariencia"],
];

/** Admin segments and whether a Colaborador may open them (§8: none of them). */
const ADMIN_SEGMENTS = ["/ajustes/general", "/ajustes/tema", "/ajustes/horario", "/ajustes/estatus", "/ajustes/permisos"];

const pathOf = (page: Page) => new URL(page.url()).pathname;

async function expectNotFound(page: Page, path: string): Promise<void> {
  const response = await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  const status = response?.status() ?? 0;
  if (status !== 404) {
    // A streamed 404 can arrive with a 200 status; the not-found page is what the viewer sees.
    await expect(page.getByText("No encontramos esta página")).toBeVisible({ timeout: 15_000 });
  }
}

test.describe("Ajustes — rutas", () => {
  test.describe.configure({ mode: "serial" });

  let colaborador: E2EUser;
  let direccion: E2EUser;

  test.beforeAll(async () => {
    colaborador = await createStaffUser({ tag: "Colaborador", role: "Colaborador" });
    direccion = await createStaffUser({ tag: "Direccion", role: "Dirección" });
  });

  test.afterAll(resetAdminPreferences);

  test("every legacy Configuración and Perfil route redirects to its Ajustes page", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    for (const [from, to] of REDIRECTS) {
      await test.step(`${from} → ${to}`, async () => {
        await page.goto(`${BASE_URL}${from}`, { waitUntil: "domcontentloaded" });
        await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, "\\/")}(\\?.*)?$`), { timeout: 15_000 });
      });
    }
  });

  test("Ajustes renders inside the new shell and the admin sees the Organización group", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/ajustes/apariencia`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Ajustes", exact: true })).toBeVisible({ timeout: 30_000 });
    expect(await rendersNewShell(page)).toBe(true);

    for (const name of ["Perfil", "Apariencia"]) {
      await expect(page.getByRole("link", { name, exact: true }).first()).toBeVisible();
    }
    for (const name of [/^General/, /^Tema y estilo/, /^Control de horario/, /^Estatus/, /^Permisos/]) {
      await expect(page.getByRole("link", { name }).first()).toBeVisible();
    }

    // Every admin segment opens for the admin, in the shell.
    for (const path of ADMIN_SEGMENTS) {
      await test.step(path, async () => {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
        await expect(page.locator("main").first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("No encontramos esta página")).toHaveCount(0);
        expect(pathOf(page)).toBe(path);
        expect(await rendersNewShell(page)).toBe(true);
      });
    }
  });

  test("Perfil shows the own fields and the password form", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/ajustes/perfil`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Ajustes", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(ADMIN_EMAIL, { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Cambiar contraseña/ }).first()).toBeVisible();
  });

  test("a Colaborador gets 404 on every admin segment and sees only the Personal group", async ({ browser }) => {
    const { context, page } = await signedInContext(browser, colaborador);
    try {
      for (const path of ["/ajustes/perfil", "/ajustes/apariencia"]) {
        await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: "Ajustes", exact: true })).toBeVisible({ timeout: 30_000 });
        expect(pathOf(page)).toBe(path);
      }
      // AjustesNav: the Organización items are absent from the DOM, not just hidden.
      for (const name of [/^Tema y estilo/, /^Control de horario/, /^Estatus/, /^Permisos/]) {
        await expect(page.getByRole("link", { name })).toHaveCount(0);
      }
      for (const path of ADMIN_SEGMENTS) {
        await test.step(path, () => expectNotFound(page, path));
      }
    } finally {
      await context.close();
    }
  });

  test("Dirección reaches Control de horario with the report only", async ({ browser }) => {
    const { context, page } = await signedInContext(browser, direccion);
    try {
      await page.goto(`${BASE_URL}/ajustes/horario`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Horas del equipo/).first()).toBeVisible({ timeout: 30_000 });
      // Read-only rules: no switch and no save.
      await expect(page.getByRole("switch", { name: /Control de horario/ })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Guardar cambios" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: /Exportar CSV/ }).or(page.getByRole("button", { name: /Exportar CSV/ }))).toBeVisible();
      for (const path of ["/ajustes/tema", "/ajustes/permisos", "/ajustes/estatus"]) {
        await test.step(path, () => expectNotFound(page, path));
      }
    } finally {
      await context.close();
    }
  });
});
