/**
 * E2E: the project shell (redesign FE §3.5): `/proyectos/<id>` opens on
 * Resumen with the project header and tabs, and every tab (Tareas,
 * Cronograma, Archivos, Ficha) opens under the same header with its tab
 * marked current. Cutto appears only as links, never embedded.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";

import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
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

test.describe("Proyecto · Resumen y pestañas", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("opens a project on Resumen and walks its tabs", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}$`));
    await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Local comercial · CDMX · Responsable:/)).toBeVisible();

    const tabs = page.getByRole("navigation", { name: "Secciones del proyecto" });
    await expect(tabs.getByRole("tab", { name: /^Resumen/ })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("link", { name: "Nueva tarea" })).toHaveAttribute(
      "href",
      `/tareas?proyecto=${projectId}&nueva=1`
    );
    // Cutto stays a link that opens in a new tab, never an embed.
    await expect(page.locator("iframe[src*='cutto']")).toHaveCount(0);

    for (const [label, section] of [
      ["Tareas", "tareas"],
      ["Cronograma", "cronograma"],
      ["Archivos", "archivos"],
      ["Ficha", "ficha"],
      ["Resumen", ""],
    ] as const) {
      await test.step(label, async () => {
        await page
          .getByRole("navigation", { name: "Secciones del proyecto" })
          .getByRole("tab", { name: new RegExp(`^${label}`) })
          .click();
        const path = section ? `/proyectos/${projectId}/${section}` : `/proyectos/${projectId}`;
        await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 30_000 });
        await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
        await expect(
          page
            .getByRole("navigation", { name: "Secciones del proyecto" })
            .getByRole("tab", { name: new RegExp(`^${label}`) })
        ).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
      });
    }
  });
});
