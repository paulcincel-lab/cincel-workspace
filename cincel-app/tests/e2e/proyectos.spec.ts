/**
 * E2E: Proyectos — create a project and assert it persists in the list.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT_NAME = `Proyecto E2E ${RUN_ID}`;
const CLIENT_NAME = `Cliente E2E ${RUN_ID}`;

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

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

    // The sheet asks only for the name: client, etapa and the rest are set in the ficha.
    await expect(page.getByRole("combobox")).toHaveCount(0);

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
