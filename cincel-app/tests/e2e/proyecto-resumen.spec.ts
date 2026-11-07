/**
 * E2E: the project shell and the Resumen tab (redesign FE §3.5, issue R4-05).
 * Flag off: `/proyectos/<id>` still opens the Ficha, as before.
 * Flag on: `/proyectos/<id>` renders the project header, the tabs (Resumen
 * active) and the Resumen; the other tab routes keep working; Cutto appears
 * only as links that open in a new tab.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";

import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";
import { setRedesignFlag } from "./helpers/redesign-flag";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";
const PROJECT_NAME = `Proyecto Resumen E2E ${Date.now()}`;

let projectId = "";

/** A project in Presale, managed by the seeded admin (so the team row has a Cutto link). */
async function seedProject(): Promise<string> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [presale] = await sql`select id from core.workflows where key = 'presale' and deleted_at is null limit 1`;
    const [admin] = await sql`
      select id from core.staff
      where lower(email) = lower(${process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx"}) and deleted_at is null
      limit 1`;
    const [project] = await sql`
      insert into core.projects (name, current_workflow_id, status, project_type, address_city, manager_id)
      values (${PROJECT_NAME}, ${presale.id}, 'activo', 'Local comercial', 'CDMX', ${admin?.id ?? null})
      returning id`;
    await sql`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${presale.id})`;
    return project.id as string;
  } finally {
    await sql.end();
  }
}

test.beforeAll(async () => {
  projectId = await seedProject();
});

test.describe("Proyecto — flag off", () => {
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

  test("/proyectos/<id> opens the Ficha as before", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}/ficha`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Resumen" })).toHaveCount(0);
  });
});

test.describe("Proyecto · Resumen — flag on", () => {
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

  test("renders the header, the tabs with Resumen active and the Resumen", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}$`));
    await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Local comercial · CDMX · Responsable:/)).toBeVisible();

    const tabs = page.getByRole("navigation", { name: "Secciones del proyecto" });
    await expect(tabs.getByRole("tab", { name: /^Resumen/ })).toHaveAttribute("aria-current", "page");
    await expect(tabs.getByRole("tab", { name: /^Tareas/ })).toHaveAttribute("href", `/proyectos/${projectId}/tareas`);
    await expect(tabs.getByRole("tab", { name: /^Ficha/ })).toHaveAttribute("href", `/proyectos/${projectId}/ficha`);

    await expect(page.getByRole("link", { name: "Reporte" })).toHaveAttribute(
      "href",
      `/proyectos/${projectId}/cronograma/reporte`
    );
    await expect(page.getByRole("link", { name: "Nueva tarea" })).toHaveAttribute(
      "href",
      `/tareas?proyecto=${projectId}&nueva=1`
    );
  });

  test("Cutto appears only as links that open in a new tab", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("iframe[src*='cutto']")).toHaveCount(0);
    const links = page.getByRole("link", { name: /Abrir chat en Cutto/ });
    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
      await expect(link).toHaveAttribute("href", /^https:\/\/cutto\.cloudketer\.dev\//);
    }
  });

  test("the other tab routes keep working", async ({ page }) => {
    for (const section of ["ficha", "cronograma", "archivos"]) {
      const response = await page.goto(`${BASE_URL}/proyectos/${projectId}/${section}`, { waitUntil: "domcontentloaded" });
      expect(response?.status() ?? 0).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}/${section}`));
    }
  });

  test("?estilo= switches the Resumen to Esencial and Analítico without changing the route", async ({ page }) => {
    for (const estilo of ["esencial", "analitico"]) {
      await page.goto(`${BASE_URL}/proyectos/${projectId}?estilo=${estilo}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}\\?estilo=${estilo}`));
    }
  });
});
