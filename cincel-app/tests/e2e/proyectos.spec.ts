/**
 * E2E: Proyectos — create a project and assert it persists in the list.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT_NAME = `Proyecto E2E ${RUN_ID}`;
const CLIENT_NAME = `Cliente E2E ${RUN_ID}`;

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

// A project always belongs to a client (see AGENTS.md — "Cada proyecto
// pertenece a un cliente"), so the label wraps a Select, not a plain input.
function fieldContainer(page: Page, labelText: string) {
  return page.locator("label").filter({ hasText: labelText }).last();
}

/**
 * Seeds a client contact directly (skips the directorio UI, out of scope here).
 * Memoized: every test's beforeEach calls it with the same per-run name, and a
 * second insert would hit contacts_type_name_lower_uq.
 */
let clientSeeded: Promise<void> | null = null;
async function seedClient(): Promise<void> {
  clientSeeded ??= (async () => {
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`
        insert into core.contacts (type, kind, name)
        values ('cliente', 'empresa', ${CLIENT_NAME})
      `;
    } finally {
      await sql.end();
    }
  })();
  return clientSeeded;
}

test.describe("Proyectos — create and edit", () => {
  test.beforeEach(async ({ page }) => {
    await seedClient();
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    // Wait for the exact Proyectos heading
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("create a project and verify it appears in the list", async ({ page }) => {
    await page.getByRole("button", { name: /Nuevo proyecto/i }).click();
    await page.getByRole("heading", { name: "Nuevo proyecto" }).waitFor({ state: "visible" });

    // The label wraps its input (implicit htmlFor association)
    await page.getByLabel("Nombre del proyecto").fill(PROJECT_NAME);

    // Cliente is required — a project always belongs to a client — so pick
    // the seeded client from the combobox before submitting.
    await fieldContainer(page, "Cliente").getByRole("combobox").click();
    await page.getByRole("option", { name: CLIENT_NAME }).click();

    await page.getByRole("button", { name: "Crear proyecto" }).click();

    // After creation the app navigates to the project's ficha page — the
    // project name itself renders as the page's <h1>, there is no separate
    // static "Ficha del proyecto" heading.
    await expect(page).toHaveURL(/\/proyectos\/[^/]+\/ficha$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: PROJECT_NAME })).toBeVisible({ timeout: 20_000 });

    // The ficha's Cerrar button returns to the project list.
    await page.getByRole("link", { name: "Cerrar" }).click();
    await expect(page).toHaveURL(/\/proyectos$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 15_000 });

    // Verify the project persists in the list
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByPlaceholder(/filtrar/i).fill(PROJECT_NAME);
    await expect(page.getByText(PROJECT_NAME).first()).toBeVisible({ timeout: 15_000 });
  });

  test("a project can be in several stages and have several phases (#435)", async ({ page }) => {
    const name = `Proyecto multietapa E2E ${Date.now()}`;
    const sql = postgres(connectionString, { max: 1 });
    let projectId = "";
    try {
      const [presale] = await sql`select id from core.workflows where key = 'presale' limit 1`;
      const [client] = await sql`
        insert into core.contacts (type, kind, name) values ('cliente', 'particular', ${`Cliente multietapa E2E ${Date.now()}`}) returning id`;
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

    const stages = page.getByRole("group", { name: "Etapas del proyecto" });
    const stageBox = (label: string) => stages.locator("label").filter({ hasText: label }).getByRole("checkbox");

    // The only stage can't be unticked.
    await expect(stageBox("Presale")).toBeChecked();
    await expect(stageBox("Presale")).toBeDisabled();

    // Add Diseño in parallel: both are shown and Presale becomes untickable.
    await stageBox("Diseño").click();
    await expect(stageBox("Diseño")).toBeChecked({ timeout: 15_000 });
    await expect(stageBox("Presale")).toBeEnabled();

    // Several phases: tick a known one, add a custom one, save.
    await page.getByRole("button", { name: "Editar" }).click();
    const phases = page.locator("fieldset").filter({ hasText: "Fases" });
    await phases.locator("label").filter({ hasText: /^Inicial$/ }).getByRole("checkbox").click();
    await phases.getByPlaceholder("Otra fase…").fill("Fase especial E2E");
    await phases.getByRole("button", { name: "Agregar fase" }).click();
    await page.getByRole("button", { name: "Guardar" }).click();

    // Persisted after reload.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 30_000 });
    await expect(stageBox("Presale")).toBeChecked();
    await expect(stageBox("Diseño")).toBeChecked();
    const phaseList = page.locator("dd").filter({ hasText: "Fase especial E2E" });
    await expect(phaseList.getByText("Inicial", { exact: true })).toBeVisible();
    await expect(phaseList.getByText("Fase especial E2E", { exact: true })).toBeVisible();

    // The project list shows every stage.
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/filtrar/i).fill(name);
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row.getByText("Presale", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("Diseño", { exact: true })).toBeVisible();
  });

  test("the client of a project can be changed from its ficha (#453)", async ({ page }) => {
    const stamp = Date.now();
    const name = `Proyecto cambio cliente E2E ${stamp}`;
    const oldClient = `Cliente viejo E2E ${stamp}`;
    const newClient = `Cliente nuevo E2E ${stamp}`;
    const sql = postgres(connectionString, { max: 1 });
    let projectId = "";
    try {
      const [presale] = await sql`select id from core.workflows where key = 'presale' limit 1`;
      const [old] = await sql`
        insert into core.contacts (type, kind, name) values ('cliente', 'particular', ${oldClient}) returning id`;
      await sql`insert into core.contacts (type, kind, name) values ('cliente', 'particular', ${newClient})`;
      const [project] = await sql`
        insert into core.projects (name, client_id, current_workflow_id, status)
        values (${name}, ${old.id}, ${presale.id}, 'activo') returning id`;
      await sql`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${presale.id})`;
      projectId = project.id;
    } finally {
      await sql.end();
    }

    await page.goto(`${BASE_URL}/proyectos/${projectId}/ficha`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: oldClient })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Editar" }).click();
    // First field of "Datos generales" in edit mode.
    await page.locator("label").filter({ hasText: /^Cliente/ }).first().getByRole("combobox").click();
    await page.getByRole("option", { name: newClient }).click();
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByRole("link", { name: newClient })).toBeVisible({ timeout: 15_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: newClient })).toBeVisible({ timeout: 30_000 });
  });
});
