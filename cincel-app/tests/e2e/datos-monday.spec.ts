/**
 * E2E: Datos de monday — the read-only import data panel in the task drawer,
 * the project ficha and the Directorio contact sheet, from hand-seeded
 * `core.import_refs` (monday-migration FE §2.3).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const CLIENT_NAME = `Cliente monday E2E ${RUN_ID}`;
const PROJECT_NAME = `Proyecto monday E2E ${RUN_ID}`;
const TASK_TITLE = `Tarea monday E2E ${RUN_ID}`;
const PLAIN_TASK_TITLE = `Tarea sin monday E2E ${RUN_ID}`;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

let seeded: { projectId: string; batchId: string } | null = null;

function refData(columns: Record<string, string>) {
  return {
    source: {
      boardId: "1001",
      boardName: "Obras E2E",
      groupId: "g1",
      groupTitle: "En curso",
    },
    columns,
  };
}

async function seed(): Promise<{ projectId: string; batchId: string }> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [workflow] =
      await sql`select id from core.workflows where key = 'presale' limit 1`;
    const [admin] = await sql`
      select id from core.staff where lower(email) = lower(${ADMIN_EMAIL}) and deleted_at is null limit 1
    `;
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${CLIENT_NAME})
      returning id
    `;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${PROJECT_NAME}, ${client.id}, ${workflow.id}, 'activo')
      returning id
    `;
    const [task] = await sql`
      insert into core.tasks (project_id, workflow_id, kind, title, status, created_by_id, manager_id)
      values (${project.id}, ${workflow.id}, 'usuario', ${TASK_TITLE}, 'pendiente', ${admin.id}, ${admin.id})
      returning id
    `;
    await sql`
      insert into core.tasks (project_id, workflow_id, kind, title, status, created_by_id, manager_id)
      values (${project.id}, ${workflow.id}, 'usuario', ${PLAIN_TASK_TITLE}, 'pendiente', ${admin.id}, ${admin.id})
    `;
    const [batch] = await sql`
      insert into core.import_batches (account_id, exported_at, export_path, mapping, status, applied_by_id)
      values (${`e2e-${RUN_ID}`}, now(), '/tmp/e2e', '{}'::jsonb, 'applied', ${admin.id})
      returning id
    `;
    const refs = [
      {
        entity: "contact",
        rowId: client.id,
        data: refData({ Origen: "Feria Hogar" }),
      },
      {
        entity: "project",
        rowId: project.id,
        data: refData({ Presupuesto: "120000" }),
      },
      {
        entity: "task",
        rowId: task.id,
        data: {
          ...refData({ Plano: "https://example.com/plano.pdf" }),
          milestone: true,
        },
      },
    ];
    for (const ref of refs) {
      await sql`
        insert into core.import_refs (source, entity, external_id, row_id, batch_id, data)
        values ('monday', ${ref.entity}, ${`${ref.entity}-${RUN_ID}`}, ${ref.rowId}, ${batch.id}, ${sql.json(ref.data)})
      `;
    }
    return { projectId: project.id as string, batchId: batch.id as string };
  } finally {
    await sql.end();
  }
}

async function openPanel(page: Page, scope = page.locator("body")) {
  const trigger = scope.getByRole("button", { name: "Datos de monday" });
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
  await expect(
    scope.getByText(
      /Importado de monday el .* · tablero Obras E2E · grupo En curso/,
    ),
  ).toBeVisible();
}

test.describe("Datos de monday", () => {
  test.beforeAll(async () => {
    seeded = await seed();
  });

  test.afterAll(async () => {
    if (!seeded) return;
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`delete from core.import_refs where batch_id = ${seeded.batchId}`;
      await sql`delete from core.import_batches where id = ${seeded.batchId}`;
    } finally {
      await sql.end();
    }
  });

  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("task drawer shows the task's monday data, and not on other tasks", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/actividades/presale`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("button", { name: /Nueva tarea/i }).first(),
    ).toBeVisible({ timeout: 30_000 });
    const drawer = page.locator('[data-slot="sheet-content"]');

    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_TITLE);
    await page.getByTitle("Ver detalle").first().click();
    await page
      .getByText("Detalle de tarea")
      .waitFor({ state: "visible", timeout: 15_000 });
    await openPanel(page, drawer);
    await expect(
      drawer.getByRole("link", { name: "https://example.com/plano.pdf" }),
    ).toBeVisible();
    await expect(drawer.getByRole("cell", { name: "Sí" })).toBeVisible();
    await drawer.getByRole("button", { name: "Cerrar" }).last().click();

    await page.getByPlaceholder(/Buscar tarea/i).fill(PLAIN_TASK_TITLE);
    await page.getByTitle("Ver detalle").first().click();
    await page
      .getByText("Detalle de tarea")
      .waitFor({ state: "visible", timeout: 15_000 });
    await expect(drawer.getByText("Resumen")).toBeVisible();
    await expect(
      drawer.getByRole("button", { name: "Datos de monday" }),
    ).toHaveCount(0);
  });

  test("project ficha shows the project's monday data", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${seeded!.projectId}/ficha`, {
      waitUntil: "domcontentloaded",
    });
    await openPanel(page);
    await expect(page.getByRole("cell", { name: "120000" })).toBeVisible();
  });

  test("Directorio contact sheet shows the contact's monday data", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/directorio`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByPlaceholder("Buscar en el directorio…").fill(CLIENT_NAME);
    const row = page.locator("tr", { hasText: CLIENT_NAME }).first();
    await row.waitFor({ state: "visible", timeout: 30_000 });
    await row.getByRole("button", { name: "Acciones" }).click();
    await page.getByRole("menuitem", { name: "Ver ficha" }).click();
    await expect(
      page.getByRole("heading", { name: "Ficha del cliente" }),
    ).toBeVisible({ timeout: 15_000 });
    const sheet = page.locator('[data-slot="sheet-content"]');
    await openPanel(page, sheet);
    await expect(
      sheet.getByRole("cell", { name: "Feria Hogar" }),
    ).toBeVisible();
  });
});
