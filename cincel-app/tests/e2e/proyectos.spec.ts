/**
 * E2E: Proyectos (Project Flow FE §15) — a name-only create that starts
 * Presale with its 10 unassigned template tasks, the Tramo column in every
 * Estilo (never "Etapa" / "Etapas"), the ficha's Tramos card, the
 * NAME_TAKEN copy, and the Presale → Diseño hand-off: once every
 * Presale·Cobro task is done the project shows in Diseño's
 * "Listos para iniciar". Also the create's "Tramo inicial" (#1034): Diseño
 * with some fases, and "Ninguno".
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";

import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";
import { BASE_URL, withDb } from "./helpers/redesign";

const RUN_ID = Date.now();

/** Presale has 10 template tasks in the default catalog (`scripts/default-catalog.mjs`). */
const PRESALE_TEMPLATE_COUNT = 10;

/** Matches a column header or label that still says "Etapa" / "Etapas". */
const ETAPA = /^etapas?$/i;

/**
 * The seeded auto-start defaults: Presale starts on create, every other tramo
 * is manual (so a ready project waits in "Listos para iniciar"). Other specs
 * may change them in Tramos y fases, so put them back once before this file runs.
 */
async function restoreAutoStartDefaults(): Promise<void> {
  await withDb(async (sql) => {
    await sql`update core.workflows set auto_start = 'on_create' where key = 'presale' and deleted_at is null`;
    await sql`update core.workflows set auto_start = 'manual' where key <> 'presale' and deleted_at is null`;
  });
}

/** A client-less project with a started Presale stage, as auto-start leaves it. */
async function seedProjectInPresale(name: string): Promise<string> {
  return withDb(async (sql) => {
    const [presale] = await sql<{ id: string }[]>`
      select id from core.workflows where key = 'presale' and deleted_at is null limit 1`;
    if (!presale) throw new Error("seeded Presale tramo not found");
    const [project] = await sql<{ id: string }[]>`
      insert into core.projects (name, current_workflow_id, status)
      values (${name}, ${presale.id}, 'activo') returning id`;
    await sql`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${presale.id})`;
    return project.id;
  });
}

/** Opens "Nuevo proyecto" from /proyectos (Analítico), fills the name and submits. */
async function submitNewProject(page: Page, name: string): Promise<void> {
  await page.goto(`${BASE_URL}/proyectos?estilo=analitico`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Nuevo proyecto" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Nuevo proyecto" })).toBeVisible();
  await dialog.getByLabel("Nombre del proyecto").fill(name);
  await dialog.getByRole("button", { name: "Crear proyecto" }).click();
}

/** Opens "Nuevo proyecto", fills the name and picks `tramo` in "Tramo inicial" (#1034); does not submit. */
async function openNewProjectWithTramo(page: Page, name: string, tramo: string) {
  await page.goto(`${BASE_URL}/proyectos?estilo=analitico`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Nuevo proyecto" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre del proyecto").fill(name);
  const select = dialog.getByRole("combobox", { name: "Tramo inicial" });
  // Defaults to Presale, the first tramo, while its auto-start is on.
  await expect(select).toHaveText(/Presale/, { timeout: 15_000 });
  await select.click();
  await page.getByRole("option", { name: tramo, exact: true }).click();
  await expect(select).toHaveText(new RegExp(tramo));
  return dialog;
}

/** The project's stages and workflow tasks, by tramo key. */
async function projectFlowRows(projectId: string) {
  return withDb(async (sql) => {
    const stages = await sql<{ key: string }[]>`
      select w.key from core.project_stages ps join core.workflows w on w.id = ps.workflow_id
      where ps.project_id = ${projectId}`;
    const tasks = await sql<{ key: string; phase_id: string; manager_id: string | null }[]>`
      select w.key, t.phase_id, t.manager_id from core.tasks t join core.workflows w on w.id = t.workflow_id
      where t.project_id = ${projectId} and t.kind = 'workflow' and t.deleted_at is null`;
    const [project] = await sql<{ current: string | null }[]>`
      select w.key as current from core.projects p left join core.workflows w on w.id = p.current_workflow_id
      where p.id = ${projectId}`;
    return { stages: stages.map((r) => r.key), tasks, current: project?.current ?? null };
  });
}

/** Lands on the new project's page and returns its id. */
async function landedProjectId(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/proyectos\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const match = /\/proyectos\/([0-9a-f-]{36})$/.exec(page.url());
  if (!match) throw new Error(`unexpected project URL: ${page.url()}`);
  return match[1];
}

/** Creates a project by name from the UI and returns its id from the URL it lands on. */
async function createProjectFromUi(page: Page, name: string): Promise<string> {
  await submitNewProject(page, name);
  return landedProjectId(page);
}

test.beforeAll(async () => {
  await restoreAutoStartDefaults();
});

test.describe("Proyectos · tramos", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("a name-only create starts Presale with 10 unassigned tasks and lists it under Tramo", async ({ page }) => {
    const name = `Proyecto E2E ${RUN_ID}`;

    await page.goto(`${BASE_URL}/proyectos?estilo=analitico`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Nuevo proyecto" }).first().click();
    const dialog = page.getByRole("dialog");
    // Only the name is required; no initial "Etapa" to pick.
    await expect(dialog.getByText("Solo necesitas el nombre. Presale se inicia automáticamente.")).toBeVisible();
    await expect(dialog.getByText(/etapa/i)).toHaveCount(0);
    await page.keyboard.press("Escape");

    const projectId = await createProjectFromUi(page, name);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 30_000 });

    // Presale auto-start created its 10 template tasks, none of them assigned.
    const counts = await withDb(async (sql) => {
      const [row] = await sql<{ total: number; unassigned: number; stages: number }[]>`
        select
          (select count(*)::int from core.tasks t
             join core.workflows w on w.id = t.workflow_id
            where t.project_id = ${projectId} and w.key = 'presale' and t.kind = 'workflow' and t.deleted_at is null) as total,
          (select count(*)::int from core.tasks t
             join core.workflows w on w.id = t.workflow_id
            where t.project_id = ${projectId} and w.key = 'presale' and t.kind = 'workflow' and t.deleted_at is null
              and t.manager_id is null
              and not exists (select 1 from core.task_support s where s.task_id = t.id)) as unassigned,
          (select count(*)::int from core.project_stages ps
             join core.workflows w on w.id = ps.workflow_id
            where ps.project_id = ${projectId} and w.key = 'presale') as stages`;
      return row;
    });
    expect(counts.total).toBe(PRESALE_TEMPLATE_COUNT);
    expect(counts.unassigned).toBe(PRESALE_TEMPLATE_COUNT);
    expect(counts.stages).toBe(1);

    // Analítico: the table has a Tramo column (no "Etapa") and the row sits in Presale.
    await page.goto(`${BASE_URL}/proyectos?estilo=analitico&q=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("columnheader", { name: /^tramo actual$/i }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("columnheader", { name: ETAPA })).toHaveCount(0);
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name, exact: true }) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Presale", { exact: true })).toBeVisible();

    // Esencial: the card's tramo line names Presale.
    await page.goto(`${BASE_URL}/proyectos?estilo=esencial`, { waitUntil: "domcontentloaded" });
    await page.getByRole("searchbox", { name: "Buscar proyectos" }).fill(name);
    await expect(page.getByRole("group", { name: "Tramo actual: Presale" }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(ETAPA)).toHaveCount(0);

    // Visual: the portfolio board has the card in the Presale column.
    await page.goto(`${BASE_URL}/proyectos?estilo=visual`, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(`[data-slot="board-column"][data-column="presale"] [data-slot="board-card"][data-project="${projectId}"]`),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(ETAPA)).toHaveCount(0);

    // Ficha: a "Tramos" card (never "Etapas") with Presale started and current.
    await page.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tramos", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: ETAPA })).toHaveCount(0);
    const started = page.getByRole("list", { name: "Tramos iniciados" });
    await expect(started.locator("li").filter({ hasText: "Presale" }).getByText("Tramo actual")).toBeVisible();
    await expect(started.getByText(/Iniciado el/).first()).toBeVisible();
  });

  test("picking Diseño as the starting tramo starts only Diseño with the checked fases, unassigned", async ({ page }) => {
    const name = `Proyecto Diseño E2E ${RUN_ID}`;
    const dialog = await openNewProjectWithTramo(page, name, "Diseño");

    // Diseño's fases are listed, all checked; uncheck the last one.
    const phases = dialog.getByRole("group", { name: "Fases" }).getByRole("checkbox");
    const total = await phases.count();
    expect(total).toBeGreaterThan(1);
    for (let i = 0; i < total; i++) await expect(phases.nth(i)).toBeChecked();
    await phases.nth(total - 1).click();
    await expect(phases.nth(total - 1)).not.toBeChecked();

    await dialog.getByRole("button", { name: "Crear proyecto" }).click();
    const projectId = await landedProjectId(page);

    const rows = await projectFlowRows(projectId);
    expect(rows.stages).toEqual(["diseno"]);
    expect(rows.current).toBe("diseno");
    expect(rows.tasks.length).toBeGreaterThan(0);
    expect(rows.tasks.every((t) => t.key === "diseno" && t.manager_id === null)).toBe(true);
    // The unchecked (last) fase got no tasks.
    const [lastPhase] = await withDb(
      (sql) => sql<{ id: string }[]>`
        select p.id from core.workflow_phases p join core.workflows w on w.id = p.workflow_id
        where w.key = 'diseno' and p.active order by p.sort_order desc, p.name desc limit 1`,
    );
    expect(rows.tasks.some((t) => t.phase_id === lastPhase.id)).toBe(false);
  });

  test("«Ninguno» creates the project with no tramo; it shows under Sin tramo", async ({ page }) => {
    const name = `Proyecto sin tramo E2E ${RUN_ID}`;
    const dialog = await openNewProjectWithTramo(page, name, "Ninguno");
    await expect(dialog.getByRole("group", { name: "Fases" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Crear proyecto" }).click();
    const projectId = await landedProjectId(page);

    const rows = await projectFlowRows(projectId);
    expect(rows.stages).toEqual([]);
    expect(rows.current).toBeNull();
    expect(rows.tasks).toHaveLength(0);

    // Visual: the portfolio board has the card in the "Sin tramo" column.
    await page.goto(`${BASE_URL}/proyectos?estilo=visual`, { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(`[data-slot="board-column"][data-column="sin-tramo"] [data-slot="board-card"][data-project="${projectId}"]`),
    ).toBeVisible({ timeout: 30_000 });
  });

  test("a duplicate project name, in any casing, is refused with the NAME_TAKEN copy", async ({ page }) => {
    const name = `Proyecto repetido E2E ${RUN_ID}`;
    await seedProjectInPresale(name);

    await submitNewProject(page, name.toUpperCase());
    await expect(page.getByRole("dialog").getByText("Ya existe un proyecto con ese nombre.")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/proyectos(\?|$)/);
  });

  test("completing Presale·Cobro moves the project to Diseño's «Listos para iniciar»", async ({ page }) => {
    const name = `Proyecto cobro E2E ${RUN_ID}`;
    const projectId = await createProjectFromUi(page, name);

    // `/actividades/diseno` redirects here: Tareas · Analítico filtered to Diseño, with the start slot.
    const disenoUrl = `${BASE_URL}/tareas?estilo=analitico&tramo=diseno`;
    const readyRow = page.getByRole("listitem").filter({ hasText: name }).filter({ hasText: /Listo desde/ });
    const startButton = page.getByRole("button", { name: `Iniciar Diseño en ${name}` });

    // Before Cobro is done the project waits in "Próximos".
    await page.goto(disenoUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/^Listos para iniciar/).first()).toBeVisible({ timeout: 30_000 });
    await expect(readyRow).toHaveCount(0);
    await expect(startButton).toHaveCount(0);
    await page.getByRole("button", { name: /^Próximos/ }).click();
    await expect(page.getByText(new RegExp(`${name} · falta Cobro de Presale`))).toBeVisible({ timeout: 15_000 });

    // Complete every Presale·Cobro task of the project.
    const closed = await withDb(
      (sql) => sql`
        update core.tasks t set status = 'completado', custom_status_id = null, closed_at = now()
        from core.workflow_phases p, core.workflows w
        where t.project_id = ${projectId} and t.phase_id = p.id and p.workflow_id = w.id
          and w.key = 'presale' and p.key = 'cobro' and t.deleted_at is null
        returning t.id`,
    );
    expect(closed.length).toBeGreaterThan(0);

    await page.goto(disenoUrl, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/^Listos para iniciar/).first()).toBeVisible({ timeout: 30_000 });
    await expect(readyRow).toBeVisible({ timeout: 15_000 });
    await expect(startButton).toBeVisible();
  });
});
