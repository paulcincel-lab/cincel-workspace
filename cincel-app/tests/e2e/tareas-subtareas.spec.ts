/**
 * E2E: Tareas › Analítico, subtasks as a collapsible block under their parent
 * row (#1048). The subtask isn't a flat row; the parent's toggle (or →)
 * shows it under the parent with the "1/2"-style chip; "+ Subtarea…" adds
 * one inline and the chip follows; the state stays after a re-sort and
 * resets on reload.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const RUN_ID = Date.now();
const PARENT_TITLE = `Tarea con subtareas E2E ${RUN_ID}`;
const CHILD_TITLE = `Subtarea uno E2E ${RUN_ID}`;
const NEW_CHILD_TITLE = `Subtarea nueva E2E ${RUN_ID}`;

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** An active presale project (tagged E2E for global-cleanup) with a task and one subtask. */
async function seedProject(): Promise<{ projectId: string; parentId: string }> {
  return withSql(async (sql) => {
    const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    if (!workflow) throw new Error("presale workflow not seeded");
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${`Cliente Subtareas E2E ${RUN_ID}`})
      returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${`Proyecto Subtareas E2E ${RUN_ID}`}, ${client.id}, ${workflow.id}, 'activo')
      returning id`;
    const insert = (title: string, parentId: string | null) => sql`
      insert into core.tasks (project_id, kind, workflow_id, title, status, parent_task_id, created_by_id)
      select p.id, 'usuario', p.current_workflow_id, ${title}, 'pendiente', ${parentId},
             (select id from core.staff where deleted_at is null order by created_at limit 1)
      from core.projects p where p.id = ${project.id}
      returning id`;
    const [parent] = await insert(PARENT_TITLE, null);
    await insert(CHILD_TITLE, parent.id);
    return { projectId: project.id as string, parentId: parent.id as string };
  });
}

test.describe("Tareas · Subtareas", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("subtasks show under their parent when expanded, and an inline subtask updates the chip", async ({ page }) => {
    const { projectId, parentId } = await seedProject();
    await page.goto(`${BASE_URL}/tareas?estilo=analitico&proyecto=${projectId}`, { waitUntil: "domcontentloaded" });

    const table = page.locator(`[data-slot="tareas-analitico"]`);
    await expect(table.getByText(PARENT_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });
    // Collapsed by default: no flat subtask row.
    await expect(table.getByText(CHILD_TITLE, { exact: true })).toHaveCount(0);
    const parentRow = table.locator(`[data-slot="leaf-row"][data-row-id="${parentId}"]`);
    await expect(parentRow.locator('[data-slot="subtask-progress"]')).toContainText("0/1");

    const toggle = table.getByRole("button", { name: `Subtareas de «${PARENT_TITLE}»` });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const nested = table.locator(`[data-slot="leaf-row"][data-depth="1"][data-parent-row-id="${parentId}"]`);
    await expect(nested).toHaveCount(1);
    await expect(nested.getByText(CHILD_TITLE, { exact: true })).toBeVisible();

    // "+ Subtarea…" under the parent.
    const add = table.getByRole("textbox", { name: `Nueva subtarea de «${PARENT_TITLE}»` });
    await add.fill(NEW_CHILD_TITLE);
    await add.press("Enter");
    await expect(nested).toHaveCount(2, { timeout: 15_000 });
    await expect(parentRow.locator('[data-slot="subtask-progress"]')).toContainText("0/2", { timeout: 15_000 });

    // Re-sorting keeps it open; a reload collapses it again.
    await table.getByRole("columnheader", { name: "Vence" }).getByRole("button").first().click();
    await expect(nested).toHaveCount(2, { timeout: 15_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(table.getByText(PARENT_TITLE, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(table.getByText(CHILD_TITLE, { exact: true })).toHaveCount(0);

    // → on the parent's first cell opens the block from the keyboard.
    await table.locator(`[data-cell-row="${parentId}"][data-cell-column="tarea"]`).focus();
    await page.keyboard.press("ArrowRight");
    await expect(nested).toHaveCount(2);
  });
});
