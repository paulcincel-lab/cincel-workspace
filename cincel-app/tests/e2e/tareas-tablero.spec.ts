/**
 * E2E: the task routes before and after the redesign (FE §2.2, §3.4).
 * Flag off: `/tablero`, `/mis-tareas` and `/calendario` render as today and
 * `/tareas` is not reachable. Flag on: they redirect to the views of
 * `/tareas`; the Tablero view moves a card between columns by drag and drop
 * and the task sheet opens and closes through `?tarea=<id>`.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";
import { E2E_ADMIN_EMAIL, setRedesignFlag } from "./helpers/redesign-flag";

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

let boardTaskId: Promise<string> | null = null;

/**
 * Seeds (once per run) an active presale project and one pending task the
 * admin manages, all tagged E2E for global-cleanup. Returns the task id.
 */
function ensureBoardTask(): Promise<string> {
  boardTaskId ??= withSql(async (sql) => {
    const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    if (!workflow) throw new Error("presale workflow not seeded");
    const [admin] = await sql`
      select id from core.staff where lower(email) = lower(${E2E_ADMIN_EMAIL}) and deleted_at is null limit 1`;
    if (!admin) throw new Error("seeded admin not found");
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${`Cliente Tablero E2E ${RUN_ID}`})
      returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${`Proyecto Tablero E2E ${RUN_ID}`}, ${client.id}, ${workflow.id}, 'activo')
      returning id`;
    const [task] = await sql`
      insert into core.tasks (project_id, workflow_id, kind, title, status, created_by_id, manager_id)
      values (${project.id}, ${workflow.id}, 'usuario', ${TASK_TITLE}, 'pendiente', ${admin.id}, ${admin.id})
      returning id`;
    return task.id as string;
  });
  return boardTaskId;
}

async function taskStatus(id: string): Promise<string> {
  return withSql(async (sql) => {
    const [row] = await sql`select status from core.tasks where id = ${id}`;
    return row?.status as string;
  });
}

/** A board column, named by its status (the count may follow the name). */
function column(page: Page, status: string) {
  return page.getByRole("group", { name: new RegExp(`^${status}`) }).first();
}

/** The draggable card of the seeded task. */
function card(page: Page) {
  return page.locator('[draggable="true"]').filter({ hasText: TASK_TITLE }).first();
}

/** The open task sheet (FormSheet on the shadcn Sheet). */
function sheet(page: Page) {
  return page.locator('[data-slot="sheet-content"]');
}

async function expectSheetShowsTask(page: Page): Promise<void> {
  const drawer = sheet(page);
  await expect(drawer).toBeVisible({ timeout: 15_000 });
  // The title is inline-editable: plain text or an input holding it.
  await expect(
    drawer
      .getByText(TASK_TITLE, { exact: true })
      .or(drawer.locator(`input[value="${TASK_TITLE}"]`))
      .first()
  ).toBeVisible({ timeout: 15_000 });
}

test.describe("Rutas de tareas — flag off", () => {
  test.beforeAll(async () => {
    await setRedesignFlag(false);
  });

  test.afterAll(async () => {
    await setRedesignFlag(null);
  });

  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("/tablero, /mis-tareas and /calendario render the legacy pages", async ({ page }) => {
    await page.goto(`${BASE_URL}/tablero`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tablero/);
    await expect(page.getByRole("heading", { name: "Tablero", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("tablero-board")).toBeVisible();

    await page.goto(`${BASE_URL}/mis-tareas`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/mis-tareas/);
    await expect(page.getByRole("heading", { name: "Mis tareas", exact: true })).toBeVisible({ timeout: 30_000 });

    await page.goto(`${BASE_URL}/calendario`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/calendario/);
    await expect(page.getByRole("heading", { name: "Calendario", exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("/tareas is not reachable and falls back to a legacy page", async ({ page }) => {
    await page.goto(`${BASE_URL}/tareas?vista=tablero`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(/\/tareas(\?|$)/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/(tablero|mis-tareas|calendario|dashboard|actividades)/);
  });
});

test.describe("Tareas — flag on", () => {
  test.beforeAll(async () => {
    await setRedesignFlag(true);
  });

  test.afterAll(async () => {
    await setRedesignFlag(null);
  });

  test.beforeEach(async ({ page }) => {
    await ensureBoardTask();
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("legacy routes redirect to the views of /tareas", async ({ page }) => {
    const expected: Array<[string, Record<string, string>]> = [
      ["/tablero", { vista: "tablero" }],
      ["/mis-tareas", { vista: "lista", responsable: "yo" }],
      ["/calendario", { vista: "calendario" }],
    ];
    for (const [legacy, params] of expected) {
      await page.goto(`${BASE_URL}${legacy}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/tareas\?/, { timeout: 30_000 });
      const url = new URL(page.url());
      for (const [key, value] of Object.entries(params)) expect(url.searchParams.get(key)).toBe(value);
      await expect(page.getByRole("heading", { name: "Tareas", exact: true })).toBeVisible({ timeout: 30_000 });
    }
  });

  test("the view switch moves between Tablero, Lista and Calendario through the URL", async ({ page }) => {
    await page.goto(`${BASE_URL}/tareas?vista=tablero`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tareas", exact: true })).toBeVisible({ timeout: 30_000 });

    for (const [label, vista] of [
      ["Lista", "lista"],
      ["Calendario", "calendario"],
      ["Tablero", "tablero"],
    ] as const) {
      await page.getByRole("link", { name: label, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`[?&]vista=${vista}`), { timeout: 30_000 });
    }
  });

  test("dragging a card to another column changes its status and survives a reload", async ({ page }) => {
    const taskId = await ensureBoardTask();
    await page.goto(`${BASE_URL}/tareas?vista=tablero&q=${encodeURIComponent(TASK_TITLE)}`, {
      waitUntil: "domcontentloaded",
    });

    await expect(column(page, "Pendiente").getByText(TASK_TITLE)).toBeVisible({ timeout: 30_000 });
    // An empty column collapses to a strip but still takes the drop.
    await card(page).dragTo(column(page, "En proceso"));

    // Optimistic move first, then the server confirms it.
    await expect(column(page, "En proceso").getByText(TASK_TITLE)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => taskStatus(taskId), { timeout: 15_000 }).toBe("en_proceso");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(column(page, "En proceso").getByText(TASK_TITLE)).toBeVisible({ timeout: 30_000 });
    await expect(column(page, "Pendiente").getByText(TASK_TITLE)).toHaveCount(0);

    // Back to Pendiente so the sheet tests below start from a known state.
    await card(page).dragTo(column(page, "Pendiente"));
    await expect(column(page, "Pendiente").getByText(TASK_TITLE)).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => taskStatus(taskId), { timeout: 15_000 }).toBe("pendiente");
  });

  test("the card title opens the task sheet via ?tarea= and closing removes it without leaving the board", async ({
    page,
  }) => {
    const taskId = await ensureBoardTask();
    await page.goto(`${BASE_URL}/tareas?vista=tablero&q=${encodeURIComponent(TASK_TITLE)}`, {
      waitUntil: "domcontentloaded",
    });

    const titleLink = card(page).getByRole("link", { name: TASK_TITLE });
    await expect(titleLink).toBeVisible({ timeout: 30_000 });
    await expect(titleLink).toHaveAttribute("href", new RegExp(`[?&]tarea=${taskId}`));
    await titleLink.click();

    await expect(page).toHaveURL(new RegExp(`[?&]tarea=${taskId}`), { timeout: 15_000 });
    await expectSheetShowsTask(page);
    // The view underneath stays mounted with its filters.
    await expect(page).toHaveURL(/[?&]vista=tablero/);
    await expect(column(page, "Pendiente")).toBeAttached();

    await sheet(page).getByRole("button", { name: "Cerrar", exact: true }).first().click();
    await expect(sheet(page)).toBeHidden({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/[?&]tarea=/);
    await expect(page).toHaveURL(/[?&]vista=tablero/);
    await expect(card(page)).toBeVisible();
  });

  test("a deep link to /tareas?tarea=<id> opens the sheet and Escape closes it", async ({ page }) => {
    const taskId = await ensureBoardTask();
    await page.goto(`${BASE_URL}/tareas?vista=tablero&tarea=${taskId}`, { waitUntil: "domcontentloaded" });
    await expectSheetShowsTask(page);

    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden({ timeout: 15_000 });
    await expect(page).not.toHaveURL(/[?&]tarea=/);
    await expect(page).toHaveURL(/\/tareas\?(.*&)?vista=tablero/);
  });
});
