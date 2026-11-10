/**
 * E2E: Tareas › Analítico, "Ocultar completadas" (#1039). The switch hides
 * the completed tasks of the table, the tramo group says "1 completada
 * oculta · Mostrar", the URL carries `?completadas=0`, and the choice is
 * remembered across reloads (a URL without the param follows the saved
 * preference). "Mostrar" turns it off again.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { e2eAdminEmail, loginAsAdmin, seedAuth } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const RUN_ID = Date.now();
const OPEN_TITLE = `Tarea abierta E2E ${RUN_ID}`;
const DONE_TITLE = `Tarea completada E2E ${RUN_ID}`;

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** An active presale project (tagged E2E for global-cleanup) with one open and one completed task. */
async function seedProject(): Promise<string> {
  return withSql(async (sql) => {
    const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    if (!workflow) throw new Error("presale workflow not seeded");
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${`Cliente Completadas E2E ${RUN_ID}`})
      returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${`Proyecto Completadas E2E ${RUN_ID}`}, ${client.id}, ${workflow.id}, 'activo')
      returning id`;
    for (const [title, status] of [
      [OPEN_TITLE, "pendiente"],
      [DONE_TITLE, "completado"],
    ] as const) {
      await sql`
        insert into core.tasks (project_id, kind, workflow_id, title, status, created_by_id)
        select p.id, 'usuario', p.current_workflow_id, ${title}, ${status},
               (select id from core.staff where deleted_at is null order by created_at limit 1)
        from core.projects p where p.id = ${project.id}`;
    }
    return project.id as string;
  });
}

/** The admin's saved "Ocultar completadas" (false without a preferences row). */
async function hidePreference(): Promise<boolean> {
  return withSql(async (sql) => {
    const [row] = await sql`
      select up.hide_completed_tasks as hide from core.user_preferences up
      join core.staff s on s.id = up.staff_id
      where lower(s.email) = lower(${e2eAdminEmail()})`;
    return Boolean(row?.hide);
  });
}

test.describe("Tareas · Ocultar completadas", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("hides the completed tasks, remembers it across reloads and Mostrar reveals them", async ({ page }) => {
    const projectId = await seedProject();
    const url = `${BASE_URL}/tareas?estilo=analitico&proyecto=${projectId}`;
    await page.goto(`${url}&completadas=1`, { waitUntil: "domcontentloaded" });

    const table = page.locator(`[data-slot="tareas-analitico"]`);
    await expect(table.getByText(OPEN_TITLE)).toBeVisible({ timeout: 30_000 });
    await expect(table.getByText(DONE_TITLE)).toBeVisible();

    const toggle = page.getByRole("switch", { name: "Ocultar completadas" });
    await expect(toggle).not.toBeChecked();
    await toggle.click();

    await expect(page).toHaveURL(/[?&]completadas=0/);
    await expect(table.getByText(DONE_TITLE)).toHaveCount(0, { timeout: 15_000 });
    await expect(table.getByText(OPEN_TITLE)).toBeVisible();
    await expect(page.getByText("1 completada oculta")).toBeVisible();
    await expect.poll(hidePreference, { timeout: 15_000 }).toBe(true);

    // A URL without the param follows the saved preference.
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(table.getByText(OPEN_TITLE)).toBeVisible({ timeout: 30_000 });
    await expect(table.getByText(DONE_TITLE)).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Ocultar completadas" })).toBeChecked();

    // "Mostrar" turns the switch off and brings the completed task back.
    await page.getByRole("button", { name: "Mostrar", exact: true }).click();
    await expect(table.getByText(DONE_TITLE)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("switch", { name: "Ocultar completadas" })).not.toBeChecked();
    await expect(page).not.toHaveURL(/[?&]completadas=0/);
    await expect.poll(hidePreference, { timeout: 15_000 }).toBe(false);
  });
});
