/**
 * E2E: Actividades — the unified "Todas" view shows tasks from every stage
 * of a project in one place (#435).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT = `Proyecto Todas E2E ${RUN_ID}`;
const PRESALE_TASK = `Tarea presale E2E ${RUN_ID}`;
const DISENO_TASK = `Tarea diseno E2E ${RUN_ID}`;
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function seed(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [admin] = await sql`select id from core.staff where lower(email) = 'paul@cincel.mx' limit 1`;
    const [presale] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    const [diseno] = await sql`select id from core.workflows where key = 'diseno' limit 1`;
    if (!admin || !presale || !diseno) throw new Error("seeded admin/workflows not found");
    const [client] = await sql`
      insert into core.contacts (type, kind, name) values ('cliente', 'particular', ${`Cliente Todas E2E ${RUN_ID}`}) returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${PROJECT}, ${client.id}, ${diseno.id}, 'activo') returning id`;
    await sql`
      insert into core.tasks (project_id, kind, workflow_id, title, created_by_id, manager_id)
      values (${project.id}, 'usuario', ${presale.id}, ${PRESALE_TASK}, ${admin.id}, ${admin.id}),
             (${project.id}, 'usuario', ${diseno.id}, ${DISENO_TASK}, ${admin.id}, ${admin.id})`;
  } finally {
    await sql.end();
  }
}

test.describe("Actividades — vista unificada Todas", () => {
  test("shows tasks from different stages of one project together, and filters by stage", async ({ page }) => {
    await seed();
    await loginAsAdmin(page, BASE_URL);

    // Reachable from the sidebar submenu.
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Actividades" }).click();
    await page.getByRole("link", { name: "Todas", exact: true }).click();
    await expect(page).toHaveURL(/\/actividades\/todas$/, { timeout: 15_000 });

    // Decoración was retired: no sidebar entry, no tab, and its URL is not found.
    await expect(page.getByRole("link", { name: "Decoración", exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Decoración" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Todas las actividades" })).toBeVisible();

    // One project panel holding a task from each stage, each labelled with its stage.
    await page.getByPlaceholder("Buscar tarea...").fill(`E2E ${RUN_ID}`);
    const panel = page.getByRole("region").filter({ hasText: PRESALE_TASK });
    await expect(panel.getByText(DISENO_TASK)).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByRole("row").filter({ hasText: PRESALE_TASK }).getByText("Presale", { exact: true })).toBeVisible();
    await expect(panel.getByRole("row").filter({ hasText: DISENO_TASK }).getByText("Taller de Diseño", { exact: true })).toBeVisible();

    // Filtering by stage keeps only that stage's task.
    await page.getByRole("combobox").filter({ hasText: "Etapa" }).click();
    await page.getByRole("option", { name: "Taller de Diseño" }).click();
    await expect(page.getByText(DISENO_TASK)).toBeVisible();
    await expect(page.getByText(PRESALE_TASK)).toHaveCount(0);

    // A task title links to its department page.
    await page.getByRole("link", { name: DISENO_TASK }).click();
    await expect(page).toHaveURL(/\/actividades\/diseno\?project=/, { timeout: 15_000 });

    await page.goto(`${BASE_URL}/actividades/decoracion`);
    await expect(page.getByText("This page could not be found")).toBeVisible({ timeout: 15_000 });
  });
});
