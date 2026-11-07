/**
 * E2E: Proyectos — name-only create, the Tramo column (no "Etapas"), the ficha's
 * Tramos card, and the Presale → Diseño hand-off once Presale·Cobro is done.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT_NAME = `Proyecto E2E ${RUN_ID}`;

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

/** Presale has 10 template tasks in the default catalog (BE §5.2). */
const PRESALE_TEMPLATE_COUNT = 10;

/**
 * The seeded auto-start defaults (BE §4.3 step 1): Presale starts on create,
 * every other tramo is manual. Other specs may toggle them in Tramos y fases,
 * so put them back once before this file runs.
 */
let defaultsRestored: Promise<void> | null = null;
async function restoreAutoStartDefaults(): Promise<void> {
  defaultsRestored ??= (async () => {
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`update core.workflows set auto_start = 'on_create' where key = 'presale' and deleted_at is null`;
      await sql`update core.workflows set auto_start = 'manual' where key <> 'presale' and deleted_at is null`;
    } finally {
      await sql.end();
    }
  })();
  return defaultsRestored;
}

/** Creates a project from "+ Nuevo proyecto" (name only) and returns its id from the ficha URL. */
async function createProjectFromUi(page: Page, name: string): Promise<string> {
  await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Nuevo proyecto/i }).click();
  await page.getByRole("heading", { name: "Nuevo proyecto" }).waitFor({ state: "visible" });
  await page.getByLabel("Nombre del proyecto").fill(name);
  await page.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page).toHaveURL(/\/proyectos\/[^/]+\/ficha$/, { timeout: 20_000 });
  const match = /\/proyectos\/([^/]+)\/ficha$/.exec(page.url());
  if (!match) throw new Error(`unexpected ficha URL: ${page.url()}`);
  return match[1];
}

/** Seeds a client-less project with a started Presale stage (as auto-start would). */
async function seedProjectInPresale(name: string): Promise<string> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [presale] = await sql`select id from core.workflows where key = 'presale' and deleted_at is null limit 1`;
    if (!presale) throw new Error("seeded Presale tramo not found");
    const [project] = await sql`
      insert into core.projects (name, current_workflow_id, status)
      values (${name}, ${presale.id}, 'activo') returning id`;
    await sql`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${presale.id})`;
    return project.id as string;
  } finally {
    await sql.end();
  }
}

test.describe("Proyectos — create and edit", () => {
  test.beforeEach(async ({ page }) => {
    await restoreAutoStartDefaults();
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    // Wait for the exact Proyectos heading
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("create a project with only its name; it starts Presale with 10 unassigned tasks", async ({ page }) => {
    await page.getByRole("button", { name: /Nuevo proyecto/i }).click();
    await page.getByRole("heading", { name: "Nuevo proyecto" }).waitFor({ state: "visible" });

    // The sheet asks only for the name (FE §3.4): no Cliente, Etapa inicial,
    // Tipo, Encargado or Fecha de inicio.
    await expect(page.getByText("Solo necesitas el nombre. Presale se inicia automáticamente.")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Cliente" })).toHaveCount(0);
    await expect(page.getByText(/Etapa inicial/i)).toHaveCount(0);

    // Empty name is refused inline.
    await page.getByRole("button", { name: "Crear proyecto" }).click();
    await expect(page.getByText("El nombre del proyecto es obligatorio.")).toBeVisible();

    // The label wraps its input (implicit htmlFor association)
    await page.getByLabel("Nombre del proyecto").fill(PROJECT_NAME);
    await page.getByRole("button", { name: "Crear proyecto" }).click();

    // After creation the app navigates to the project's ficha page — the
    // project name itself renders as the page's <h1>.
    await expect(page).toHaveURL(/\/proyectos\/[^/]+\/ficha$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: PROJECT_NAME })).toBeVisible({ timeout: 20_000 });
    const projectId = /\/proyectos\/([^/]+)\/ficha$/.exec(page.url())?.[1];
    expect(projectId).toBeTruthy();

    // The ficha has a "Tramos" card, not "Etapas", and Presale is started.
    await expect(page.getByRole("heading", { name: "Tramos", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Etapas", exact: true })).toHaveCount(0);
    await expect(page.getByText(/Iniciado el/).first()).toBeVisible();

    // Presale auto-start created its 10 template tasks, none of them assigned.
    const sql = postgres(connectionString, { max: 1 });
    try {
      const [counts] = await sql`
        select count(*)::int as total,
               count(*) filter (
                 where t.manager_id is null
                   and not exists (select 1 from core.task_support s where s.task_id = t.id)
               )::int as unassigned
        from core.tasks t
        join core.workflows w on w.id = t.workflow_id
        where t.project_id = ${projectId!} and w.key = 'presale'
          and t.kind = 'workflow' and t.deleted_at is null`;
      expect(counts.total).toBe(PRESALE_TEMPLATE_COUNT);
      expect(counts.unassigned).toBe(PRESALE_TEMPLATE_COUNT);
      const [stage] = await sql`
        select 1 from core.project_stages ps join core.workflows w on w.id = ps.workflow_id
        where ps.project_id = ${projectId!} and w.key = 'presale'`;
      expect(stage).toBeTruthy();
    } finally {
      await sql.end();
    }

    // The ficha's Cerrar button returns to the project list.
    await page.getByRole("link", { name: "Cerrar" }).click();
    await expect(page).toHaveURL(/\/proyectos$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 15_000 });

    // The list has a Tramo column, never "Etapa(s)".
    await expect(page.getByRole("columnheader", { name: "Tramo", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("columnheader", { name: "Fase activa", exact: true })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /^Etapas?$/ })).toHaveCount(0);

    // Verify the project persists in the list, in Presale, with its client still to assign.
    await page.getByPlaceholder(/filtrar/i).fill(PROJECT_NAME);
    const row = page.getByRole("row").filter({ hasText: PROJECT_NAME });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("Presale", { exact: true })).toBeVisible();
    await expect(row.getByText("Por asignar", { exact: true })).toBeVisible();
  });

  test("the ficha shows its tramos, switches the current one and manages espacios (#733)", async ({ page }) => {
    const name = `Proyecto tramos E2E ${Date.now()}`;
    const sql = postgres(connectionString, { max: 1 });
    let projectId = "";
    try {
      const [presale] = await sql`select id from core.workflows where key = 'presale' limit 1`;
      const [diseno] = await sql`select id from core.workflows where key = 'diseno' limit 1`;
      const [project] = await sql`
        insert into core.projects (name, current_workflow_id, status)
        values (${name}, ${presale.id}, 'activo') returning id`;
      await sql`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${presale.id}), (${project.id}, ${diseno.id})`;
      projectId = project.id;
    } finally {
      await sql.end();
    }

    await page.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });

    // Started tramos are listed; the old stage checkboxes and "Aplicar workflow" are gone.
    const started = page.getByRole("list", { name: "Tramos iniciados" });
    await expect(started.getByText("Presale", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(started.getByText("Diseño", { exact: true })).toBeVisible();
    await expect(page.getByRole("group", { name: "Etapas del proyecto" })).toHaveCount(0);
    await expect(page.getByText("Aplicar workflow")).toHaveCount(0);

    // A tramo not started yet links to its Actividades page with the project preselected.
    await expect(page.getByRole("link", { name: "Iniciar Construcción" })).toHaveAttribute(
      "href",
      `/actividades/construccion?project=${projectId}`
    );

    // Switch the current tramo to Diseño; it persists after reload.
    await page.getByRole("combobox", { name: "Tramo actual" }).click();
    await page.getByRole("option", { name: "Diseño" }).click();
    await expect(started.locator("li").filter({ hasText: "Diseño" }).getByText("Tramo actual")).toBeVisible({ timeout: 15_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("list", { name: "Tramos iniciados" }).locator("li").filter({ hasText: "Diseño" }).getByText("Tramo actual")
    ).toBeVisible({ timeout: 30_000 });

    // Espacios: empty state, then add one.
    await expect(page.getByText(/^Sin espacios\./)).toBeVisible();
    await page.getByRole("button", { name: "+ Agregar espacio" }).click();
    await page.getByRole("textbox", { name: "Nombre del espacio" }).fill("Depto 201");
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Renombrar Depto 201" })).toBeVisible({ timeout: 15_000 });
  });

  test("a duplicate project name is refused with the NAME_TAKEN copy", async ({ page }) => {
    const name = `Proyecto repetido E2E ${Date.now()}`;
    await seedProjectInPresale(name);

    await page.getByRole("button", { name: /Nuevo proyecto/i }).click();
    await page.getByRole("heading", { name: "Nuevo proyecto" }).waitFor({ state: "visible" });
    await page.getByLabel("Nombre del proyecto").fill(name);
    await page.getByRole("button", { name: "Crear proyecto" }).click();
    await expect(page.getByText("Ya existe un proyecto con ese nombre.")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/proyectos$/);
  });

  test("the ficha's Tramos card lists started tramos and links to start the next one", async ({ page }) => {
    const name = `Proyecto tramos E2E ${Date.now()}`;
    const projectId = await seedProjectInPresale(name);

    await page.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole("heading", { name: "Tramos", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Etapas del proyecto/)).toHaveCount(0);
    await expect(page.getByText(/Iniciado el/).first()).toBeVisible();

    // "Iniciar Diseño" deep-links to the tramo's board with the sheet open (B1),
    // even though the project isn't ready for Diseño yet.
    const startDiseno = page.getByRole("link", { name: "Iniciar Diseño" });
    await expect(startDiseno).toHaveAttribute("href", new RegExp(`/actividades/diseno\\?project=${projectId}$`));
    await startDiseno.click();
    await expect(page).toHaveURL(new RegExp(`/actividades/diseno\\?project=${projectId}$`), { timeout: 15_000 });
    await expect(page.getByRole("dialog").getByText(`Iniciar Diseño · ${name}`)).toBeVisible({ timeout: 15_000 });

    // The project list shows the current tramo in the Tramo column.
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/filtrar/i).fill(name);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row.getByText("Presale", { exact: true })).toBeVisible({ timeout: 15_000 });
  });

  test("completing Presale·Cobro moves the project to Diseño's «Listos para iniciar»", async ({ page }) => {
    const name = `Proyecto cobro E2E ${Date.now()}`;
    const projectId = await createProjectFromUi(page, name);

    // Before Cobro is done the project waits in Diseño's "Próximos".
    await page.goto(`${BASE_URL}/actividades/diseno`, { waitUntil: "domcontentloaded" });
    // A "Listos para iniciar" row: the project name, "Listo desde {fecha}" and an "Iniciar" button.
    const readyRow = page.getByRole("listitem").filter({ hasText: name }).filter({ hasText: /Listo desde/ });
    const startButton = page.getByRole("button", { name: `Iniciar Diseño en ${name}` });
    await expect(page.getByText(/^Listos para iniciar/).first()).toBeVisible({ timeout: 30_000 });
    await expect(readyRow).toHaveCount(0);
    await expect(startButton).toHaveCount(0);
    await page.getByRole("button", { name: /^Próximos/ }).click();
    await expect(page.getByText(new RegExp(`${name} · falta Cobro de Presale`))).toBeVisible({ timeout: 15_000 });

    // Complete every Presale·Cobro task of the project.
    const sql = postgres(connectionString, { max: 1 });
    try {
      const closed = await sql`
        update core.tasks t set status = 'completado', custom_status_id = null, closed_at = now()
        from core.workflow_phases p, core.workflows w
        where t.project_id = ${projectId} and t.phase_id = p.id and p.workflow_id = w.id
          and w.key = 'presale' and p.key = 'cobro' and t.deleted_at is null
        returning t.id`;
      expect(closed.length).toBeGreaterThan(0);
    } finally {
      await sql.end();
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(/^Listos para iniciar/).first()).toBeVisible({ timeout: 30_000 });
    await expect(readyRow).toBeVisible({ timeout: 15_000 });
    await expect(startButton).toBeVisible();
  });

  test("an admin can set the client of a project from its ficha (#453)", async ({ page }) => {
    const stamp = Date.now();
    const name = `Proyecto cambio cliente E2E ${stamp}`;
    const newClient = `Cliente nuevo E2E ${stamp}`;
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`insert into core.contacts (type, kind, name) values ('cliente', 'particular', ${newClient})`;
    } finally {
      await sql.end();
    }
    const projectId = await seedProjectInPresale(name);

    await page.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
    // No client yet: admins see "Por asignar".
    await expect(page.getByText("Por asignar", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Editar" }).click();
    await expect(page.getByText("Al asignar el cliente se cierra la tarea «Asignar cliente y origen».")).toBeVisible();
    // First field of "Datos generales" in edit mode.
    await page.getByRole("combobox", { name: "Cliente" }).first().click();
    await page.getByRole("option", { name: newClient }).click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Guardar", exact: true }).click();

    await expect(page.getByRole("link", { name: newClient })).toBeVisible({ timeout: 15_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: newClient })).toBeVisible({ timeout: 30_000 });
  });

  test("Drive links can be added to a project by URL, split into Interno / Cliente (#450)", async ({ page }) => {
    const stamp = Date.now();
    const name = `Proyecto enlaces E2E ${stamp}`;
    const sql = postgres(connectionString, { max: 1 });
    let projectId = "";
    try {
      const [presale] = await sql`select id from core.workflows where key = 'presale' limit 1`;
      const [client] = await sql`
        insert into core.contacts (type, kind, name) values ('cliente', 'particular', ${`Cliente enlaces E2E ${stamp}`}) returning id`;
      const [project] = await sql`
        insert into core.projects (name, client_id, current_workflow_id, status)
        values (${name}, ${client.id}, ${presale.id}, 'activo') returning id`;
      await sql`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${presale.id})`;
      projectId = project.id;
    } finally {
      await sql.end();
    }

    await page.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });

    const addLink = async (kind: "interno" | "cliente", title: string, url: string) => {
      await page.getByLabel("Tipo de enlace").selectOption(kind);
      await page.getByPlaceholder("Nombre del enlace").fill(title);
      await page.getByPlaceholder(/drive\.google\.com/).fill(url);
      await page.getByRole("button", { name: "Agregar enlace" }).click();
    };

    // Works without Google Drive configured, and refuses non-web URLs.
    await addLink("interno", "Trampa", "javascript:alert(1)");
    await expect(page.getByText("El enlace debe empezar con http")).toBeVisible();

    await addLink("interno", "Planos internos", "https://drive.google.com/drive/folders/planos");
    await expect(page.getByRole("link", { name: "Planos internos" })).toBeVisible({ timeout: 15_000 });
    await addLink("cliente", "Carpeta del cliente", "https://drive.google.com/drive/folders/cliente");
    await expect(page.getByRole("link", { name: "Carpeta del cliente" })).toBeVisible({ timeout: 15_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Planos internos" })).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/planos",
      { timeout: 30_000 }
    );
    await expect(page.getByRole("link", { name: "Carpeta del cliente" })).toBeVisible();

    await page.locator("li").filter({ hasText: "Carpeta del cliente" }).getByRole("button", { name: "Quitar" }).click();
    await expect(page.getByRole("link", { name: "Carpeta del cliente" })).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Planos internos" })).toBeVisible();
  });
});
