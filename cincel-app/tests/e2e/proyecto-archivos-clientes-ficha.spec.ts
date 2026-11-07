/**
 * E2E: Proyecto · Archivos, Clientes and Ficha tabs (redesign FE §3.5).
 * Flag off: each tab renders the legacy page as today (old shell, section nav,
 * project name as the page title).
 * Flag on: the same tab content renders in the new project shell: Archivos
 * keeps the files browser states, Clientes keeps the portal access panel,
 * Ficha keeps the form ("Editar") under the "Ficha" heading.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";
import { setRedesignFlag } from "./helpers/redesign-flag";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT = `Proyecto Archivos Ficha E2E ${RUN_ID}`;
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

let seeded: Promise<string> | null = null;

/** A project without a Drive folder yet (status pending), so Archivos shows the "creating" state. */
function seedProject(): Promise<string> {
  seeded ??= (async () => {
    const sql = postgres(connectionString, { max: 1 });
    try {
      const [project] = await sql`
        insert into core.projects (name, status) values (${PROJECT}, 'activo') returning id`;
      return project.id as string;
    } finally {
      await sql.end();
    }
  })();
  return seeded;
}

test.describe("Proyecto · Archivos, Clientes y Ficha — flag off", () => {
  test.beforeAll(async () => {
    await setRedesignFlag(false);
  });

  test.afterAll(async () => {
    await setRedesignFlag(null);
  });

  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("Archivos renders the legacy page", async ({ page }) => {
    const id = await seedProject();
    await page.goto(`${BASE_URL}/proyectos/${id}/archivos`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Archivos" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Creando la carpeta del proyecto…")).toBeVisible();
  });

  test("Ficha renders the legacy page with the project name as title", async ({ page }) => {
    const id = await seedProject();
    await page.goto(`${BASE_URL}/proyectos/${id}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: PROJECT })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();
  });

  test("Clientes renders the legacy portal access page", async ({ page }) => {
    const id = await seedProject();
    await page.goto(`${BASE_URL}/proyectos/${id}/clientes`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Clientes" })).toBeVisible({ timeout: 30_000 });
    // The seeded project has no client yet, so inviting waits (portal gating).
    await expect(page.getByText(/Asigna un cliente al proyecto/)).toBeVisible();
  });
});

test.describe("Proyecto · Archivos, Clientes y Ficha — flag on", () => {
  test.beforeAll(async () => {
    await setRedesignFlag(true);
  });

  test.afterAll(async () => {
    await setRedesignFlag(null);
  });

  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("Archivos keeps the files browser state inside the new tab", async ({ page }) => {
    const id = await seedProject();
    await page.goto(`${BASE_URL}/proyectos/${id}/archivos`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 2, name: "Archivos" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Creando la carpeta del proyecto…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reintentar carpeta" })).toBeVisible();
  });

  test("Ficha keeps the form under the Ficha heading", async ({ page }) => {
    const id = await seedProject();
    await page.goto(`${BASE_URL}/proyectos/${id}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 2, name: "Ficha" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByRole("button", { name: "Guardar" })).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();
  });

  test("Clientes opens for an admin (portal.manageAccess)", async ({ page }) => {
    const id = await seedProject();
    await page.goto(`${BASE_URL}/proyectos/${id}/clientes`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 2, name: "Clientes" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Asigna un cliente al proyecto/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Asignar cliente" })).toHaveAttribute("href", `/proyectos/${id}/ficha`);
  });
});
