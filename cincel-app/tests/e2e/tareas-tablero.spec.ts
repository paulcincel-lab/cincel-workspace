/**
 * E2E: Tareas › Tablero (FE §3.4): a task created from "Nueva tarea" lands in Pendiente and moves to
 * another column by drag and drop; an empty board still shows every column.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const TASK_TITLE = `Tarea tablero E2E ${RUN_ID}`;

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

let boardProjectId: Promise<string> | null = null;

/**
 * Seeds (once per run) an active presale project with a client, tagged E2E
 * for global-cleanup. Returns the project id.
 */
function ensureBoardProject(): Promise<string> {
  boardProjectId ??= withSql(async (sql) => {
    const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    if (!workflow) throw new Error("presale workflow not seeded");
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${`Cliente Tablero E2E ${RUN_ID}`})
      returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${`Proyecto Tablero E2E ${RUN_ID}`}, ${client.id}, ${workflow.id}, 'activo')
      returning id`;
    return project.id as string;
  });
  return boardProjectId;
}

/** Status of the task created by the test, or null while it doesn't exist. */
async function taskStatus(projectId: string): Promise<string | null> {
  return withSql(async (sql) => {
    const [row] = await sql`
      select status::text as status from core.tasks
      where project_id = ${projectId} and title = ${TASK_TITLE} and deleted_at is null`;
    return (row?.status as string | undefined) ?? null;
  });
}

/** A board column, named by its status (the count may follow the name). */
function column(page: Page, status: string) {
  return page.getByRole("group", { name: new RegExp(`^${status}`) }).first();
}

/** The draggable card of the created task. */
function card(page: Page) {
  return page.locator('[draggable="true"]').filter({ hasText: TASK_TITLE }).first();
}

test.describe("Tareas", () => {
  test.beforeEach(async ({ page }) => {
    await ensureBoardProject();
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("with no task matching the filters the board still shows every column with 0", async ({ page }) => {
    await page.goto(`${BASE_URL}/tareas?vista=tablero&q=${encodeURIComponent(`sin coincidencias ${RUN_ID}`)}`, {
      waitUntil: "domcontentloaded",
    });

    for (const status of ["Pendiente", "En proceso", "Completado", "Bloqueado"]) {
      await expect(page.getByRole("group", { name: `${status} · 0`, exact: true })).toBeVisible({ timeout: 30_000 });
    }
    await expect(page.getByTestId("board-column-empty").first()).toBeVisible();
    await expect(page.getByText("No hay tareas con estos filtros")).toHaveCount(0);
  });

  test("a task created from Nueva tarea lands in Pendiente and moves to En proceso by drag and drop", async ({
    page,
  }) => {
    const projectId = await ensureBoardProject();
    // The project filter prefills Proyecto in the dialog and keeps the board to this project.
    await page.goto(`${BASE_URL}/tareas?vista=tablero&proyecto=${projectId}&nueva=1`, {
      waitUntil: "domcontentloaded",
    });

    const dialog = page.getByRole("dialog", { name: "Nueva tarea" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByText("Cargando…")).toHaveCount(0, { timeout: 30_000 });
    await dialog.getByLabel("Título", { exact: true }).fill(TASK_TITLE);
    await dialog.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByText("Tarea creada").first()).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/[?&]nueva=1/);
    await expect.poll(() => taskStatus(projectId), { timeout: 15_000 }).toBe("pendiente");

    await expect(column(page, "Pendiente").getByText(TASK_TITLE)).toBeVisible({ timeout: 30_000 });
    // An empty column collapses to a strip but still takes the drop.
    await card(page).dragTo(column(page, "En proceso"));

    // Optimistic move first, then the server confirms it.
    await expect(column(page, "En proceso").getByText(TASK_TITLE)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => taskStatus(projectId), { timeout: 15_000 }).toBe("en_proceso");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(column(page, "En proceso").getByText(TASK_TITLE)).toBeVisible({ timeout: 30_000 });
    await expect(column(page, "Pendiente").getByText(TASK_TITLE)).toHaveCount(0);
  });
});
