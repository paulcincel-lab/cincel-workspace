/**
 * E2E: Tareas › Analítico, delete a row (#1041). The row's ⋯ menu offers
 * "Eliminar"; the in-page confirmation names the task; confirming removes
 * the row and its subtask, and "Deshacer" in the toast brings both back.
 * Supr on a focused row opens the same confirmation.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const RUN_ID = Date.now();
const PARENT_TITLE = `Tarea a eliminar E2E ${RUN_ID}`;
const CHILD_TITLE = `Subtarea a eliminar E2E ${RUN_ID}`;
const OTHER_TITLE = `Tarea que se queda E2E ${RUN_ID}`;

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** An active presale project (tagged E2E for global-cleanup): a task with one subtask, and another task. */
/** One per seeded project: client and project names are unique. */
let seeded = 0;

async function seedProject(): Promise<{ projectId: string; parentId: string; childId: string }> {
  const seq = ++seeded;
  return withSql(async (sql) => {
    const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    if (!workflow) throw new Error("presale workflow not seeded");
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${`Cliente Eliminar E2E ${RUN_ID}-${seq}`})
      returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${`Proyecto Eliminar E2E ${RUN_ID}-${seq}`}, ${client.id}, ${workflow.id}, 'activo')
      returning id`;
    const insert = (title: string, parentId: string | null) => sql`
      insert into core.tasks (project_id, kind, workflow_id, title, status, parent_task_id, created_by_id)
      select p.id, 'usuario', p.current_workflow_id, ${title}, 'pendiente', ${parentId},
             (select id from core.staff where deleted_at is null order by created_at limit 1)
      from core.projects p where p.id = ${project.id}
      returning id`;
    const [parent] = await insert(PARENT_TITLE, null);
    const [child] = await insert(CHILD_TITLE, parent.id);
    await insert(OTHER_TITLE, null);
    return { projectId: project.id as string, parentId: parent.id as string, childId: child.id as string };
  });
}

async function deletedIds(ids: string[]): Promise<string[]> {
  return withSql(async (sql) => {
    const rows = await sql`select id from core.tasks where id in ${sql(ids)} and deleted_at is not null`;
    return rows.map((r) => r.id as string).sort();
  });
}

test.describe("Tareas · Eliminar", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("deletes a task with its subtask after confirming, and Deshacer restores both", async ({ page }) => {
    const { projectId, parentId, childId } = await seedProject();
    await page.goto(`${BASE_URL}/tareas?estilo=analitico&proyecto=${projectId}`, { waitUntil: "domcontentloaded" });

    const table = page.locator(`[data-slot="tareas-analitico"]`);
    await expect(table.getByText(PARENT_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(table.getByText(CHILD_TITLE, { exact: true })).toBeVisible();

    await table.getByRole("button", { name: `Acciones de «${PARENT_TITLE}»` }).click();
    await page.getByRole("menuitem", { name: "Eliminar" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`¿Eliminar «${PARENT_TITLE}»? Se eliminan también sus subtareas.`);
    await dialog.getByRole("button", { name: "Eliminar" }).click();

    await expect(table.getByText(PARENT_TITLE, { exact: true })).toHaveCount(0);
    await expect(table.getByText(CHILD_TITLE, { exact: true })).toHaveCount(0);
    await expect(table.getByText(OTHER_TITLE)).toBeVisible();
    await expect.poll(() => deletedIds([parentId, childId])).toEqual([parentId, childId].sort());

    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(table.getByText(PARENT_TITLE, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(table.getByText(CHILD_TITLE, { exact: true })).toBeVisible();
    await expect.poll(() => deletedIds([parentId, childId])).toEqual([]);
  });

  test("Supr on a focused row opens the confirmation; Cancelar keeps the task", async ({ page }) => {
    const { projectId } = await seedProject();
    await page.goto(`${BASE_URL}/tareas?estilo=analitico&proyecto=${projectId}`, { waitUntil: "domcontentloaded" });

    const table = page.locator(`[data-slot="tareas-analitico"]`);
    await expect(table.getByText(OTHER_TITLE)).toBeVisible({ timeout: 30_000 });
    await table.getByRole("button", { name: `Acciones de «${OTHER_TITLE}»` }).focus();
    await page.keyboard.press("Delete");
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`¿Eliminar «${OTHER_TITLE}»?`);
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(table.getByText(OTHER_TITLE)).toBeVisible();
  });
});
