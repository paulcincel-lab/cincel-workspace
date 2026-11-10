/**
 * E2E: name-only projects and their client (Project Flow FE §3.4, §3.5, §15).
 * A project created with only its name has no client: admins see
 * "Por asignar" in the ficha and the project carries the open admin task
 * "Asignar cliente y origen". Setting the client from the ficha closes that
 * task. Non-admins never see the client, the origin or admin tasks (B2).
 *
 * The create flow itself (Presale with 10 unassigned tasks, Tramo column,
 * NAME_TAKEN) is covered by `proyectos.spec.ts`.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";

import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";
import { ADMIN_EMAIL, BASE_URL, createStaffUser, signedInContext, withDb, type E2EUser } from "./helpers/redesign";

const RUN_ID = Date.now();
const CLIENT_NAME = `Cliente E2E ${RUN_ID}`;

/** A client contact to pick in the ficha (the Directorio UI is out of scope here). */
async function seedClient(): Promise<string> {
  return withDb(async (sql) => {
    const [row] = await sql<{ id: string }[]>`
      insert into core.contacts (type, kind, name) values ('cliente', 'empresa', ${CLIENT_NAME}) returning id`;
    return row.id;
  });
}

/** The project's "Asignar cliente y origen" task, or null when it has none. */
async function assignClientTask(projectId: string): Promise<{ status: string; closed: boolean } | null> {
  return withDb(async (sql) => {
    const [row] = await sql<{ status: string; closed_at: Date | null }[]>`
      select status, closed_at from core.tasks
      where project_id = ${projectId} and system_key = 'assign_client' and kind = 'admin' and deleted_at is null`;
    return row ? { status: row.status, closed: row.closed_at !== null } : null;
  });
}

/**
 * A Presale project that already has a client and an origin, plus one open
 * admin task, as an admin would leave it.
 */
async function seedProjectWithClient(name: string, clientId: string, adminTaskTitle: string): Promise<string> {
  return withDb(async (sql) => {
    const [presale] = await sql<{ id: string }[]>`
      select id from core.workflows where key = 'presale' and deleted_at is null limit 1`;
    const [admin] = await sql<{ id: string }[]>`
      select id from core.staff where lower(email) = lower(${ADMIN_EMAIL}) and deleted_at is null limit 1`;
    if (!presale || !admin) throw new Error("seeded Presale tramo or admin not found");
    const [project] = await sql<{ id: string }[]>`
      insert into core.projects (name, client_id, origin, current_workflow_id, status, address_city)
      values (${name}, ${clientId}, ${`Origen E2E ${RUN_ID}`}, ${presale.id}, 'activo', 'CDMX')
      returning id`;
    await sql`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${presale.id})`;
    await sql`
      insert into core.tasks (project_id, kind, title, priority, created_by_id)
      values (${project.id}, 'admin', ${adminTaskTitle}, 'alta', ${admin.id})`;
    return project.id;
  });
}

/** Creates a project from "Nuevo proyecto" with only its name and returns its id. */
async function createProjectByName(page: Page, name: string): Promise<string> {
  await page.goto(`${BASE_URL}/proyectos?nuevo=1`, { waitUntil: "domcontentloaded" });
  const dialog = page.getByRole("dialog", { name: "Nuevo proyecto" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  // Only the name: the optional admin fields (Cliente, Origen) stay empty.
  await dialog.getByLabel("Nombre del proyecto").fill(name);
  await dialog.getByRole("button", { name: "Crear proyecto" }).click();
  await expect(page).toHaveURL(/\/proyectos\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const match = /\/proyectos\/([0-9a-f-]{36})$/.exec(page.url());
  if (!match) throw new Error(`unexpected project URL: ${page.url()}`);
  return match[1];
}

let clientId = "";

test.beforeAll(async () => {
  clientId = await seedClient();
});

test.describe("Proyectos · cliente desde la ficha", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("a name-only project waits for its client; setting it in the ficha closes «Asignar cliente y origen»", async ({ page }) => {
    const name = `Proyecto cliente E2E ${RUN_ID}`;
    const projectId = await createProjectByName(page, name);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 30_000 });

    // The create left the project without a client and opened the admin task.
    await expect.poll(() => assignClientTask(projectId), { timeout: 15_000 }).toEqual({ status: "pendiente", closed: false });

    await page.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 2, name: "Ficha" })).toBeVisible({ timeout: 30_000 });
    const clientLine = page.locator("p").filter({ hasText: /^Cliente:/ });
    await expect(clientLine.getByText("Por asignar", { exact: true })).toBeVisible();

    // "Asignar" opens the edit form with the hint under Cliente.
    await clientLine.getByRole("button", { name: "Asignar" }).click();
    await expect(page.getByText("Al asignar el cliente se cierra la tarea «Asignar cliente y origen».")).toBeVisible();
    await page.getByRole("combobox", { name: "Cliente" }).first().click();
    await page.getByRole("option", { name: CLIENT_NAME }).click();
    await page.getByLabel("Origen").fill(`Recomendación E2E ${RUN_ID}`);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cambiar cliente" }).click();

    await expect(clientLine.getByRole("link", { name: CLIENT_NAME })).toBeVisible({ timeout: 15_000 });
    await expect(clientLine.getByText("Por asignar", { exact: true })).toHaveCount(0);

    // The backend closed the admin task with the client change (RD-10).
    await expect.poll(() => assignClientTask(projectId), { timeout: 15_000 }).toEqual({ status: "completado", closed: true });
    const saved = await withDb(async (sql) => {
      const [row] = await sql<{ client_id: string | null; origin: string | null }[]>`
        select client_id, origin from core.projects where id = ${projectId}`;
      return row;
    });
    expect(saved.client_id).toBe(clientId);
    expect(saved.origin).toBe(`Recomendación E2E ${RUN_ID}`);

    // It survives a reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("p").filter({ hasText: /^Cliente:/ }).getByRole("link", { name: CLIENT_NAME })).toBeVisible({
      timeout: 30_000,
    });
  });
});

test.describe("Proyectos · datos de administración ocultos para no administradores", () => {
  const name = `Proyecto oculto E2E ${RUN_ID}`;
  const adminTaskTitle = `Tarea admin E2E ${RUN_ID}`;
  const origin = `Origen E2E ${RUN_ID}`;
  let projectId = "";
  let viewer: E2EUser;

  test.beforeAll(async () => {
    projectId = await seedProjectWithClient(name, clientId, adminTaskTitle);
    viewer = await createStaffUser({ tag: "SinAdmin", role: "Colaborador" });
  });

  test("an admin sees the client; a Colaborador sees no client, origin or admin task", async ({ page, browser }) => {
    // Control: the admin sees the client in the ficha and the admin task in the project's tasks.
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: CLIENT_NAME })).toBeVisible({ timeout: 30_000 });
    await page.goto(`${BASE_URL}/proyectos/${projectId}/tareas`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(adminTaskTitle).first()).toBeVisible({ timeout: 30_000 });

    const { context, page: other } = await signedInContext(browser, viewer);
    try {
      const hidden = async (where: string) => {
        await expect(other.getByText(CLIENT_NAME), `client name on ${where}`).toHaveCount(0);
        await expect(other.getByText(origin), `origin on ${where}`).toHaveCount(0);
        await expect(other.getByText(adminTaskTitle), `admin task on ${where}`).toHaveCount(0);
      };

      await test.step("Proyectos", async () => {
        await other.goto(`${BASE_URL}/proyectos?estilo=analitico&q=${encodeURIComponent(name)}`, { waitUntil: "domcontentloaded" });
        await expect(other.getByRole("link", { name, exact: true }).first()).toBeVisible({ timeout: 30_000 });
        await hidden("/proyectos");
      });

      await test.step("Resumen", async () => {
        await other.goto(`${BASE_URL}/proyectos/${projectId}`, { waitUntil: "domcontentloaded" });
        await expect(other.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 30_000 });
        await expect(other.getByText("CDMX", { exact: true }).first()).toBeVisible();
        await hidden("Resumen");
      });

      await test.step("Ficha", async () => {
        await other.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
        await expect(other.getByRole("heading", { level: 2, name: "Ficha" })).toBeVisible({ timeout: 30_000 });
        // The "Cliente:" line and the admin fields are absent from the DOM, not just hidden.
        await expect(other.locator("p").filter({ hasText: /^Cliente:/ })).toHaveCount(0);
        await expect(other.getByText("Por asignar", { exact: true })).toHaveCount(0);
        await hidden("Ficha");
      });

      await test.step("Tareas del proyecto", async () => {
        await other.goto(`${BASE_URL}/proyectos/${projectId}/tareas`, { waitUntil: "domcontentloaded" });
        await expect(other.getByRole("heading", { level: 1, name })).toBeVisible({ timeout: 30_000 });
        await expect(other.getByRole("heading", { name: "Administración" })).toHaveCount(0);
        await hidden("Tareas del proyecto");
      });

      await test.step("Tareas", async () => {
        await other.goto(`${BASE_URL}/tareas`, { waitUntil: "domcontentloaded" });
        await expect(other.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
        await hidden("/tareas");
      });

      await test.step("Inicio", async () => {
        await other.goto(`${BASE_URL}/inicio`, { waitUntil: "domcontentloaded" });
        await expect(other.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
        await expect(other.getByText("Para administración")).toHaveCount(0);
        await hidden("/inicio");
      });
    } finally {
      await context.close();
    }
  });
});
