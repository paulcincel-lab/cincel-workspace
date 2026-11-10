/**
 * E2E: Tareas › Analítico, row checkboxes and the bulk bar (#1040). Select
 * one row, shift-click a range, pick a status in the bar: every selected task
 * changes in one go and the toast says how many; Deshacer puts them back.
 * The header checkbox selects the whole group, Esc clears the selection.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const RUN_ID = Date.now();
const TITLES = [1, 2, 3].map((n) => `Tarea masiva ${n} E2E ${RUN_ID}`);

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** An active presale project (tagged E2E for global-cleanup) with three pending tasks. */
/** One per seeded project: client and project names are unique. */
let seeded = 0;

async function seedProject(): Promise<{ projectId: string; taskIds: string[] }> {
  const seq = ++seeded;
  return withSql(async (sql) => {
    const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    if (!workflow) throw new Error("presale workflow not seeded");
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${`Cliente Selección E2E ${RUN_ID}-${seq}`})
      returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${`Proyecto Selección E2E ${RUN_ID}-${seq}`}, ${client.id}, ${workflow.id}, 'activo')
      returning id`;
    const taskIds: string[] = [];
    for (const title of TITLES) {
      const [task] = await sql`
        insert into core.tasks (project_id, kind, workflow_id, title, status, created_by_id)
        select p.id, 'usuario', p.current_workflow_id, ${title}, 'pendiente',
               (select id from core.staff where deleted_at is null order by created_at limit 1)
        from core.projects p where p.id = ${project.id}
        returning id`;
      taskIds.push(task.id as string);
    }
    return { projectId: project.id as string, taskIds };
  });
}

async function statuses(ids: string[]): Promise<string[]> {
  return withSql(async (sql) => {
    const rows = await sql`select status from core.tasks where id in ${sql(ids)} order by status`;
    return rows.map((r) => r.status as string);
  });
}

test.describe("Tareas · Selección y acciones masivas", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("selects a range, changes its status in one go, and Deshacer puts it back", async ({ page }) => {
    const { projectId, taskIds } = await seedProject();
    await page.goto(`${BASE_URL}/tareas?estilo=analitico&proyecto=${projectId}`, { waitUntil: "domcontentloaded" });

    const table = page.locator(`[data-slot="tareas-analitico"]`);
    await expect(table.getByText(TITLES[0])).toBeVisible({ timeout: 30_000 });

    // The range runs in table order (the rows aren't sorted by title): first row to last.
    const boxes = table.getByRole("checkbox", { name: new RegExp(`^Seleccionar «Tarea masiva \\d E2E ${RUN_ID}»$`) });
    await expect(boxes).toHaveCount(3);
    await boxes.first().click();
    const bar = page.getByRole("toolbar", { name: "1 seleccionada" });
    await expect(bar).toBeVisible();
    await boxes.last().click({ modifiers: ["Shift"] });
    await expect(page.getByRole("toolbar", { name: "3 seleccionadas" })).toBeVisible();

    await page.getByRole("toolbar").getByRole("button", { name: "Estatus" }).click();
    await page.getByRole("option", { name: /Completado/ }).click();
    await expect(page.getByText("3 tareas actualizadas.")).toBeVisible();
    await expect.poll(() => statuses(taskIds)).toEqual(["completado", "completado", "completado"]);

    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect.poll(() => statuses(taskIds)).toEqual(["pendiente", "pendiente", "pendiente"]);
  });

  test("the header checkbox selects the group; Esc clears the selection", async ({ page }) => {
    const { projectId } = await seedProject();
    await page.goto(`${BASE_URL}/tareas?estilo=analitico&proyecto=${projectId}`, { waitUntil: "domcontentloaded" });

    const table = page.locator(`[data-slot="tareas-analitico"]`);
    await expect(table.getByText(TITLES[0])).toBeVisible({ timeout: 30_000 });
    await table.getByRole("checkbox", { name: "Seleccionar todas" }).first().click();
    await expect(page.getByRole("toolbar", { name: "3 seleccionadas" })).toBeVisible();

    await table.getByRole("checkbox", { name: `Seleccionar «${TITLES[1]}»` }).focus();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("toolbar")).toHaveCount(0);
  });
});
