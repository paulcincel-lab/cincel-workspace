/**
 * E2E: Tareas › Tablero (FE §3.4): a task created from "Nueva tarea" lands in Pendiente and moves to
 * another column by drag and drop; an empty board still shows every column; a card opened in the task
 * sheet changes status there and shows in the new column after closing, without a reload or a server
 * render (Query Migration 4b, #956); a task created from a column's "+ Agregar" lands in that column
 * without a reload and moves by drag and drop, and filters, chips and the search change the URL with no
 * server render (Query Migration 4a, #955).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const RUN_ID = Date.now();
const TASK_TITLE = `Tarea tablero E2E ${RUN_ID}`;
const SHEET_TASK_TITLE = `Tarea hoja E2E ${RUN_ID}`;
const QUICK_ADD_TITLE = `Tarea agregar E2E ${RUN_ID}`;
const BLOCKED_TITLE = `Tarea bloqueada E2E ${RUN_ID}`;

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

/** A pending task in the board project, created directly (the sheet test opens it). Returns its id. */
async function seedSheetTask(projectId: string): Promise<string> {
  return withSql(async (sql) => {
    const [row] = await sql`
      insert into core.tasks (project_id, kind, workflow_id, title, created_by_id)
      select p.id, 'usuario', p.current_workflow_id, ${SHEET_TASK_TITLE},
             (select id from core.staff where deleted_at is null order by created_at limit 1)
      from core.projects p where p.id = ${projectId}
      returning id`;
    return row.id as string;
  });
}

/** A blocked task in the board project, created directly. */
async function seedBlockedTask(projectId: string): Promise<void> {
  await withSql(async (sql) => {
    await sql`
      insert into core.tasks (project_id, kind, workflow_id, title, status, created_by_id)
      select p.id, 'usuario', p.current_workflow_id, ${BLOCKED_TITLE}, 'bloqueado',
             (select id from core.staff where deleted_at is null order by created_at limit 1)
      from core.projects p where p.id = ${projectId}`;
  });
}

/** Status of the task created from "+ Agregar", or null while it doesn't exist. */
async function quickAddStatus(projectId: string): Promise<string | null> {
  return withSql(async (sql) => {
    const [row] = await sql`
      select status::text as status from core.tasks
      where project_id = ${projectId} and title = ${QUICK_ADD_TITLE} and deleted_at is null`;
    return (row?.status as string | undefined) ?? null;
  });
}

/** Status of the task the sheet test opened. */
async function sheetTaskStatus(taskId: string): Promise<string | null> {
  return withSql(async (sql) => {
    const [row] = await sql`select status::text as status from core.tasks where id = ${taskId}`;
    return (row?.status as string | undefined) ?? null;
  });
}

/** Counts the server renders (RSC requests) the page makes while `fn` runs. */
async function countRscRequests(page: Page, fn: () => Promise<void>): Promise<number> {
  let count = 0;
  const onRequest = (request: { url(): string; headers(): Record<string, string> }) => {
    if (request.headers()["rsc"] === "1" || new URL(request.url()).searchParams.has("_rsc")) count += 1;
  };
  page.on("request", onRequest);
  try {
    await fn();
  } finally {
    page.off("request", onRequest);
  }
  return count;
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

  test("a card opened in the task sheet changes status there and shows in the new column after closing", async ({
    page,
  }) => {
    const projectId = await ensureBoardProject();
    const taskId = await seedSheetTask(projectId);
    await page.goto(`${BASE_URL}/tareas?vista=tablero&proyecto=${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(column(page, "Pendiente").getByText(SHEET_TASK_TITLE)).toBeVisible({ timeout: 30_000 });

    // Open the card: the sheet loads over the board, which keeps its filters.
    await column(page, "Pendiente").getByText(SHEET_TASK_TITLE).click();
    const sheet = page.getByRole("dialog", { name: "Detalle de tarea" });
    await expect(sheet).toBeVisible({ timeout: 30_000 });
    await expect(sheet.getByLabel("Título")).toHaveValue(SHEET_TASK_TITLE, { timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`[?&]tarea=${taskId}`));
    await expect(page).toHaveURL(/[?&]vista=tablero/);

    // Change the status in the sheet: one mutation, no server render.
    const statusRsc = await countRscRequests(page, async () => {
      await sheet.getByRole("combobox", { name: "Estatus" }).click();
      await page.getByRole("option", { name: "En proceso" }).click();
      await expect.poll(() => sheetTaskStatus(taskId), { timeout: 15_000 }).toBe("en_proceso");
    });
    expect(statusRsc).toBe(0);

    // Close it: the URL drops `tarea` shallowly and the board shows the card in its new column.
    const closeRsc = await countRscRequests(page, async () => {
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden({ timeout: 15_000 });
      await expect(page).not.toHaveURL(/[?&]tarea=/);
      await expect(column(page, "En proceso").getByText(SHEET_TASK_TITLE)).toBeVisible({ timeout: 15_000 });
    });
    expect(closeRsc).toBe(0);
    await expect(column(page, "Pendiente").getByText(SHEET_TASK_TITLE)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`[?&]proyecto=${projectId}`));
  });
  test("a task created from “+ Agregar” lands in that column without a reload and moves by drag and drop (Query Migration 4a, #955)", async ({
    page,
  }) => {
    const projectId = await ensureBoardProject();
    // A blocked task keeps the Bloqueado column open (an empty column collapses to a strip without "+ Agregar").
    await seedBlockedTask(projectId);
    await page.goto(`${BASE_URL}/tareas?vista=tablero&proyecto=${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(column(page, "Bloqueado").getByText(BLOCKED_TITLE).first()).toBeVisible({ timeout: 30_000 });

    // Quick-add in Bloqueado: the shell's dialog opens with that estatus; no server render on the way.
    const createRsc = await countRscRequests(page, async () => {
      await page.getByRole("button", { name: "Agregar tarea en Bloqueado" }).click();
      const dialog = page.getByRole("dialog", { name: "Nueva tarea" });
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByText("Cargando…")).toHaveCount(0, { timeout: 30_000 });
      await dialog.getByLabel("Título", { exact: true }).fill(QUICK_ADD_TITLE);
      await dialog.getByRole("button", { name: "Crear tarea" }).click();
      await expect(dialog).toBeHidden({ timeout: 15_000 });
      await expect.poll(() => quickAddStatus(projectId), { timeout: 15_000 }).toBe("bloqueado");
      // The new card shows in its column once the dialog's invalidation refetches the board.
      await expect(column(page, "Bloqueado").getByText(QUICK_ADD_TITLE)).toBeVisible({ timeout: 15_000 });
    });
    expect(createRsc).toBe(0);

    // Drag it to Pendiente: the card moves at once, one action call, no server render.
    const quickCard = page.locator('[draggable="true"]').filter({ hasText: QUICK_ADD_TITLE }).first();
    const dragRsc = await countRscRequests(page, async () => {
      await quickCard.dragTo(column(page, "Pendiente"));
      await expect(column(page, "Pendiente").getByText(QUICK_ADD_TITLE)).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => quickAddStatus(projectId), { timeout: 15_000 }).toBe("pendiente");
    });
    expect(dragRsc).toBe(0);
  });

  test("changing a filter, a chip or the search writes the URL without a server render (Query Migration 4a, #955)", async ({
    page,
  }) => {
    const projectId = await ensureBoardProject();
    await page.goto(`${BASE_URL}/tareas?vista=tablero&proyecto=${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(column(page, "Pendiente")).toBeVisible({ timeout: 30_000 });

    const rsc = await countRscRequests(page, async () => {
      await page.getByRole("group", { name: "Filtros" }).getByText("Presale", { exact: true }).click();
      await expect(page).toHaveURL(/[?&]tramo=presale/);
      await page.getByRole("searchbox", { name: "Buscar tareas" }).fill(`sin coincidencias ${RUN_ID}`);
      await expect(page).toHaveURL(/[?&]q=sin/, { timeout: 5_000 });
      for (const status of ["Pendiente", "En proceso", "Completado", "Bloqueado"]) {
        await expect(page.getByRole("group", { name: `${status} · 0`, exact: true })).toBeVisible({ timeout: 15_000 });
      }
    });
    expect(rsc).toBe(0);
    await expect(page).toHaveURL(new RegExp(`[?&]proyecto=${projectId}`));
  });
});
