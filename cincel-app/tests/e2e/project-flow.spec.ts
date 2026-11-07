/**
 * E2E: project flow acceptance (brief §6) after the cleanup release.
 *
 * - The label table holds: no "Área", "Departamento", "Workflow" or "Etapa"
 *   for the tramo concept, and the Configuración menu has Puestos and
 *   Tramos y fases instead of Áreas and Workflows.
 * - A project is created with only a name: Presale starts with its 10 tasks
 *   and the admin task "Asignar cliente y origen" exists.
 * - Completing Presale's Cobro lists the project in Diseño "Listos para
 *   iniciar"; starting it creates the checked fases' tasks and the toast's
 *   Deshacer removes them.
 * - A task's fase can only be one of its tramo's fases (DB enforced).
 *
 * The monday boards and Madrid 22 checks of the brief are data checks on the
 * real exports and the remapped project, recorded on the release issue.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";
import { ADMIN_EMAIL, setRedesignFor } from "./helpers/redesign";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

/** Template tasks seeded per tramo (BE §5.2). */
const PRESALE_TEMPLATE_COUNT = 10;
const DISENO_TEMPLATE_COUNT = 29;

/** Old copy for the tramo concept; "Departamento" of a client company only exists in Directorio. */
const LEGACY_COPY = /Sin área|(^|[^\p{L}])Áreas?([^\p{L}]|$)|Departamento|Workflows?|(^|[^\p{L}])Etapas?([^\p{L}]|$)/u;

async function withDb<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function expectNoLegacyCopy(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: "domcontentloaded" });
  const main = page.locator("main").first();
  await expect(main).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await expect(main.getByText(LEGACY_COPY)).toHaveCount(0);
}

test.describe("Project flow — brief acceptance", () => {
  // Legacy routes and sidebar; the flag-on redirects are covered by ajustes-rutas.spec.ts.
  test.beforeAll(() => setRedesignFor(ADMIN_EMAIL, false));

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
  });

  test("no screen uses the old labels for tramos, and Configuración lists Puestos and Tramos y fases", async ({ page }) => {
    test.setTimeout(180_000);
    for (const path of [
      "/dashboard",
      "/actividades/general",
      "/actividades/presale",
      "/actividades/diseno",
      "/proyectos",
      "/mis-tareas",
      "/tablero",
      "/calendario",
      "/equipo",
      "/configuracion/tramos",
      "/configuracion/puestos",
    ]) {
      await test.step(path, () => expectNoLegacyCopy(page, path));
    }

    // Sidebar: Actividades lists the tramos by name, Configuración the new screens.
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Actividades" }).click();
    await expect(page.getByRole("link", { name: "Diseño", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /Taller de diseño/i })).toHaveCount(0);
    await page.getByRole("button", { name: "Configuración" }).click();
    await expect(page.getByRole("link", { name: "Puestos", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Tramos y fases", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Áreas", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Workflows", exact: true })).toHaveCount(0);

    // The old routes still resolve, to the new screens.
    await page.goto(`${BASE_URL}/configuracion/areas`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/configuracion\/puestos$/, { timeout: 15_000 });
    await page.goto(`${BASE_URL}/configuracion/workflows`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/configuracion\/tramos$/, { timeout: 15_000 });
  });

  test("a project created with only its name starts Presale and gets the admin task", async ({ page }) => {
    const name = `Proyecto solo nombre E2E ${RUN_ID}`;
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Nuevo proyecto/i }).click();
    const sheet = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Nuevo proyecto" }) });
    await sheet.getByLabel("Nombre del proyecto").fill(name);
    await sheet.getByRole("button", { name: "Crear proyecto" }).click();
    await expect(page).toHaveURL(/\/proyectos\/[^/]+\/ficha$/, { timeout: 20_000 });
    const projectId = new URL(page.url()).pathname.split("/")[2];

    const counts = await withDb(async (sql) => {
      const [row] = await sql`
        select
          count(*) filter (where t.kind = 'workflow' and w.key = 'presale')::int as presale,
          count(*) filter (where t.kind = 'workflow' and w.key = 'presale' and t.phase_id is null)::int as presale_without_phase,
          count(*) filter (where t.kind = 'workflow' and w.key = 'presale' and t.manager_id is not null)::int as presale_assigned,
          count(*) filter (where t.kind = 'admin' and t.system_key = 'assign_client' and t.status <> 'completado')::int as admin_open
        from core.tasks t
        left join core.workflows w on w.id = t.workflow_id
        where t.project_id = ${projectId} and t.deleted_at is null`;
      const [project] = await sql`
        select p.client_id, w.key as current
        from core.projects p left join core.workflows w on w.id = p.current_workflow_id
        where p.id = ${projectId}`;
      return { ...row, clientId: project.client_id, current: project.current };
    });
    expect(counts).toEqual({
      presale: PRESALE_TEMPLATE_COUNT,
      presale_without_phase: 0,
      presale_assigned: 0,
      admin_open: 1,
      clientId: null,
      current: "presale",
    });

    // Admins see it in "Para administración" on Presale.
    await page.goto(`${BASE_URL}/actividades/presale`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Para administración", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator("li, tr").filter({ hasText: name }).filter({ hasText: "Asignar cliente y origen" }).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("completing Presale's Cobro makes the project ready on Diseño, and Deshacer removes the started tasks", async ({ page }) => {
    test.setTimeout(90_000);
    const name = `Proyecto cobro E2E ${RUN_ID}`;
    const projectId = await withDb(async (sql) => {
      const [admin] = await sql`select id from core.staff where lower(email) = 'paul@cincel.mx' limit 1`;
      const [presale] = await sql`select id from core.workflows where key = 'presale' limit 1`;
      const [cobro] = await sql`
        select id from core.workflow_phases where workflow_id = ${presale.id} and key = 'cobro' limit 1`;
      if (!admin || !presale || !cobro) throw new Error("seeded admin/Presale·Cobro not found");
      const [project] = await sql`
        insert into core.projects (name, current_workflow_id, status)
        values (${name}, ${presale.id}, 'activo') returning id`;
      await sql`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${presale.id})`;
      await sql`
        insert into core.tasks (project_id, kind, workflow_id, phase_id, title, status, closed_at, created_by_id, manager_id)
        values (${project.id}, 'usuario', ${presale.id}, ${cobro.id}, ${`Cobro E2E ${RUN_ID}`}, 'completado', now(), ${admin.id}, ${admin.id})`;
      return project.id as string;
    });

    await page.goto(`${BASE_URL}/actividades/diseno`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/^Listos para iniciar/).first()).toBeVisible({ timeout: 30_000 });
    const start = page.getByRole("button", { name: `Iniciar Diseño en ${name}` });
    await expect(start).toBeVisible({ timeout: 15_000 });

    await start.click();
    const sheet = page.getByRole("dialog").filter({ hasText: `Iniciar Diseño · ${name}` });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await sheet.getByRole("radio", { name: "Sin asignar" }).check();
    await sheet.getByRole("button", { name: `Crear ${DISENO_TEMPLATE_COUNT} tareas` }).click();

    await expect(page.getByText(`Se crearon ${DISENO_TEMPLATE_COUNT} tareas de Diseño en ${name}.`)).toBeVisible({
      timeout: 15_000,
    });
    const disenoTasks = () =>
      withDb(async (sql) => {
        const [row] = await sql`
          select count(*)::int as n
          from core.tasks t join core.workflows w on w.id = t.workflow_id
          where t.project_id = ${projectId} and w.key = 'diseno' and t.deleted_at is null`;
        return row.n as number;
      });
    expect(await disenoTasks()).toBe(DISENO_TEMPLATE_COUNT);

    await page.getByRole("button", { name: "Deshacer", exact: true }).click();
    await expect(page.getByText("Se deshizo el inicio de Diseño.")).toBeVisible({ timeout: 15_000 });
    await expect.poll(disenoTasks, { timeout: 15_000 }).toBe(0);
  });

  test("the database refuses a fase of another tramo and an admin task with a tramo", async () => {
    await withDb(async (sql) => {
      const [admin] = await sql`select id from core.staff where lower(email) = 'paul@cincel.mx' limit 1`;
      const [presale] = await sql`select id from core.workflows where key = 'presale' limit 1`;
      const [diseno] = await sql`select id from core.workflows where key = 'diseno' limit 1`;
      const [ejecutivo] = await sql`
        select id from core.workflow_phases where workflow_id = ${diseno.id} and key = 'ejecutivo' limit 1`;
      const [project] = await sql`
        insert into core.projects (name, current_workflow_id, status)
        values (${`Proyecto fase DB E2E ${RUN_ID}`}, ${presale.id}, 'activo') returning id`;

      await expect(
        sql`
          insert into core.tasks (project_id, kind, workflow_id, phase_id, title, created_by_id)
          values (${project.id}, 'usuario', ${presale.id}, ${ejecutivo.id}, ${`Fase ajena E2E ${RUN_ID}`}, ${admin.id})`
      ).rejects.toMatchObject({ constraint_name: "tasks_phase_fk" });

      await expect(
        sql`
          insert into core.tasks (project_id, kind, workflow_id, phase_id, title, created_by_id)
          values (${project.id}, 'usuario', null, ${ejecutivo.id}, ${`Fase sin tramo E2E ${RUN_ID}`}, ${admin.id})`
      ).rejects.toMatchObject({ constraint_name: "tasks_phase_needs_workflow_check" });

      await expect(
        sql`
          insert into core.tasks (project_id, kind, workflow_id, title, created_by_id)
          values (${project.id}, 'admin', ${presale.id}, ${`Admin con tramo E2E ${RUN_ID}`}, ${admin.id})`
      ).rejects.toMatchObject({ constraint_name: "tasks_kind_check" });

      // The legacy free-text columns are gone after 0025.
      const legacy = await sql`
        select table_name, column_name from information_schema.columns
        where table_schema = 'core'
          and ((table_name = 'tasks' and column_name = 'phase')
            or (table_name = 'workflow_task_templates' and column_name = 'phase')
            or (table_name = 'projects' and column_name in ('phase', 'phases')))`;
      expect(legacy).toHaveLength(0);
      const areaTables = await sql`
        select table_name from information_schema.tables
        where table_schema = 'core' and table_name in ('areas', 'area_members', 'area_workflows')`;
      expect(areaTables).toHaveLength(0);
    });
  });
});
