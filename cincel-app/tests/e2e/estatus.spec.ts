/**
 * E2E: custom task statuses are statuses of their own — created without a
 * base status, shown as their own Tablero column, optionally closing tasks.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const STATUS_NAME = `Revisión E2E ${RUN_ID}`;
const TASK_TITLE = `Tarea estatus E2E ${RUN_ID}`;

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function seedTask(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${`Cliente estatus E2E ${RUN_ID}`}) returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${`Proyecto estatus E2E ${RUN_ID}`}, ${client.id}, ${workflow.id}, 'activo') returning id`;
    await sql`
      insert into core.tasks (project_id, workflow_id, kind, title, status, created_by_id)
      values (${project.id}, ${workflow.id}, 'usuario', ${TASK_TITLE}, 'pendiente', (select id from core.staff limit 1))`;
  } finally {
    await sql.end();
  }
}

async function taskRow(): Promise<{ status: string; custom: string | null }> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [row] = await sql`
      select t.status, s.name as custom from core.tasks t
      left join core.task_statuses s on s.id = t.custom_status_id
      where t.title = ${TASK_TITLE}`;
    return { status: row.status, custom: row.custom };
  } finally {
    await sql.end();
  }
}

test.describe("Estatus propios de tareas", () => {
  test.beforeAll(seedTask);

  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("a custom status has its own Tablero column and can close tasks", async ({ page }) => {
    // Create it: just a name — there is no base status to pick.
    await page.goto(`${BASE_URL}/configuracion/estatus`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "+ Nuevo estatus" }).click();
    await page.getByLabel("Nombre").fill(STATUS_NAME);
    await expect(page.getByText("Estatus base")).toHaveCount(0);
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("row").filter({ hasText: STATUS_NAME })).toBeVisible({ timeout: 15_000 });

    // Its own column on the Tablero; drag the task into it.
    await page.goto(`${BASE_URL}/tablero`, { waitUntil: "domcontentloaded" });
    const column = page.getByRole("group", { name: STATUS_NAME, exact: true });
    await expect(column).toBeVisible({ timeout: 30_000 });
    // The board opens on the viewer's own tasks; this one has no responsable.
    await expect(page.getByRole("group", { name: "Filtrar por miembro" }).locator('[aria-pressed="true"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Limpiar" }).click();
    const card = page.locator('[draggable="true"]').filter({ hasText: TASK_TITLE });
    // The board scrolls sideways once custom columns are added, and a mouse
    // drag across a scrolling container is flaky — fire the drag events instead.
    await card.dispatchEvent("dragstart");
    await column.dispatchEvent("dragover");
    await column.dispatchEvent("drop");
    await expect(column.getByText(TASK_TITLE)).toBeVisible({ timeout: 15_000 });
    await expect.poll(taskRow).toEqual({ status: "en_proceso", custom: STATUS_NAME });

    // Marking the status as "Cuenta como terminado" closes the tasks in it.
    await page.goto(`${BASE_URL}/configuracion/estatus`, { waitUntil: "domcontentloaded" });
    await page.getByRole("row").filter({ hasText: STATUS_NAME }).click();
    await page.getByRole("checkbox", { name: /Cuenta como terminado/ }).click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("row").filter({ hasText: STATUS_NAME }).getByText("Sí", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(taskRow).toEqual({ status: "completado", custom: STATUS_NAME });

    // Mis tareas / Actividades show the custom status by name, not a built-in one.
    await page.goto(`${BASE_URL}/actividades/presale`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_TITLE);
    // The status closes the task now, and finished tasks are hidden by default.
    await page.getByRole("switch", { name: "Mostrar completadas" }).click();
    await expect(page.getByRole("row").filter({ hasText: TASK_TITLE }).getByText(STATUS_NAME)).toBeVisible({
      timeout: 30_000,
    });
  });
});
