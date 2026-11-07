/**
 * E2E: Actividades — the General view shows one block per project, with a
 * Tramo and a Fase column on each row. There is no "Proyecto / Actividad"
 * selector and no "Sin área" group.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT = `Proyecto General E2E ${RUN_ID}`;
const OTHER_PROJECT = `Proyecto General B E2E ${RUN_ID}`;
const PRESALE_TASK = `Tarea presale E2E ${RUN_ID}`;
const DISENO_TASK = `Tarea diseno E2E ${RUN_ID}`;
const OTHER_TASK = `Tarea otro proyecto E2E ${RUN_ID}`;
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function seed(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [admin] = await sql`select id from core.staff where lower(email) = 'paul@cincel.mx' limit 1`;
    const [presale] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    const [diseno] = await sql`select id from core.workflows where key = 'diseno' limit 1`;
    if (!admin || !presale || !diseno) throw new Error("seeded admin/workflows not found");
    const [inicial] = await sql`
      select id from core.workflow_phases where workflow_id = ${presale.id} and key = 'inicial' limit 1`;
    const [anteproyecto] = await sql`
      select id from core.workflow_phases where workflow_id = ${diseno.id} and key = 'anteproyecto' limit 1`;
    if (!inicial || !anteproyecto) throw new Error("seeded fases not found");

    const [project] = await sql`
      insert into core.projects (name, current_workflow_id, status)
      values (${PROJECT}, ${diseno.id}, 'activo') returning id`;
    const [other] = await sql`
      insert into core.projects (name, current_workflow_id, status)
      values (${OTHER_PROJECT}, ${presale.id}, 'activo') returning id`;
    await sql`
      insert into core.project_stages (project_id, workflow_id)
      values (${project.id}, ${presale.id}), (${project.id}, ${diseno.id}), (${other.id}, ${presale.id})`;
    await sql`
      insert into core.tasks (project_id, kind, workflow_id, phase_id, title, created_by_id, manager_id)
      values (${project.id}, 'usuario', ${presale.id}, ${inicial.id}, ${PRESALE_TASK}, ${admin.id}, ${admin.id}),
             (${project.id}, 'usuario', ${diseno.id}, ${anteproyecto.id}, ${DISENO_TASK}, ${admin.id}, ${admin.id}),
             (${other.id}, 'usuario', ${presale.id}, ${inicial.id}, ${OTHER_TASK}, ${admin.id}, ${admin.id})`;
  } finally {
    await sql.end();
  }
}

test.describe("Actividades — vista General", () => {
  test("groups every task by project, with Tramo and Fase columns", async ({ page }) => {
    await seed();
    await loginAsAdmin(page, BASE_URL);

    // Reachable from the sidebar submenu.
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Actividades" }).click();
    await page.getByRole("link", { name: "General", exact: true }).click();
    await expect(page).toHaveURL(/\/actividades\/general$/, { timeout: 15_000 });

    await page.getByPlaceholder("Buscar tarea...").fill(`E2E ${RUN_ID}`);

    // One block per project: both tramos of the first project sit together.
    const projectPanel = page.getByRole("region").filter({ hasText: PRESALE_TASK });
    await expect(projectPanel.getByText(DISENO_TASK)).toBeVisible({ timeout: 15_000 });
    await expect(projectPanel.getByText(OTHER_TASK)).toHaveCount(0);
    await expect(page.getByRole("region").filter({ hasText: OTHER_TASK })).toBeVisible();

    // Rows name their tramo and their fase from the catalog.
    const presaleRow = projectPanel.getByRole("row").filter({ hasText: PRESALE_TASK });
    await expect(presaleRow.getByText("Presale", { exact: true })).toBeVisible();
    await expect(presaleRow.getByText("Inicial", { exact: true })).toBeVisible();
    const disenoRow = projectPanel.getByRole("row").filter({ hasText: DISENO_TASK });
    await expect(disenoRow.getByText("Diseño", { exact: true })).toBeVisible();
    await expect(disenoRow.getByText("Anteproyecto", { exact: true })).toBeVisible();

    // Rows are sorted by tramo order: Presale before Diseño.
    const rows = await projectPanel.getByRole("row").allInnerTexts();
    const presaleIndex = rows.findIndex((text) => text.includes(PRESALE_TASK));
    const disenoIndex = rows.findIndex((text) => text.includes(DISENO_TASK));
    expect(presaleIndex).toBeGreaterThanOrEqual(0);
    expect(presaleIndex).toBeLessThan(disenoIndex);

    // Columns sort on click.
    const titleHeader = projectPanel.getByRole("columnheader", { name: "Tarea" });
    await titleHeader.click();
    await expect(titleHeader).toHaveAttribute("aria-sort", "ascending");

    // The old grouping selector and the "Sin área" group are gone.
    await expect(page.getByRole("tab", { name: "Proyecto", exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Actividad", exact: true })).toHaveCount(0);
    await expect(page.getByText("Sin área")).toHaveCount(0);
    await expect(page.getByRole("columnheader", { name: /Área|Departamento/ })).toHaveCount(0);
  });
});
