/**
 * E2E: delete a project (#1050). From the Proyectos Analítico row menu, with
 * the typed name when it has open tasks; "Deshacer" brings it back with its
 * tasks. From the project header menu, then "Restaurar" in Ajustes ›
 * Proyectos eliminados.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const RUN_ID = Date.now();

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

let seeded = 0;

/** An active project (tagged E2E for global-cleanup) with two open tasks. */
async function seedProject(): Promise<{ projectId: string; name: string; taskIds: string[] }> {
  const seq = ++seeded;
  const name = `Proyecto Borrar E2E ${RUN_ID}-${seq}`;
  return withSql(async (sql) => {
    const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    if (!workflow) throw new Error("presale workflow not seeded");
    const [project] = await sql`
      insert into core.projects (name, current_workflow_id, status)
      values (${name}, ${workflow.id}, 'activo')
      returning id`;
    const insert = (title: string) => sql`
      insert into core.tasks (project_id, kind, workflow_id, title, status, created_by_id)
      select p.id, 'usuario', p.current_workflow_id, ${title}, 'pendiente',
             (select id from core.staff where deleted_at is null order by created_at limit 1)
      from core.projects p where p.id = ${project.id}
      returning id`;
    const [a] = await insert(`Tarea borrar E2E ${RUN_ID}-${seq} A`);
    const [b] = await insert(`Tarea borrar E2E ${RUN_ID}-${seq} B`);
    return { projectId: project.id as string, name, taskIds: [a.id as string, b.id as string] };
  });
}

async function deletedState(projectId: string): Promise<{ project: boolean; tasks: number }> {
  return withSql(async (sql) => {
    const [p] = await sql`select deleted_at is not null as gone from core.projects where id = ${projectId}`;
    const [t] = await sql`select count(*)::int as n from core.tasks where project_id = ${projectId} and deleted_at is not null`;
    return { project: Boolean(p?.gone), tasks: t.n as number };
  });
}

test.describe("Proyectos · Eliminar", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("deletes from the Analítico row menu after typing the name; Deshacer brings it back", async ({ page }) => {
    const { projectId, name } = await seedProject();
    await page.goto(`${BASE_URL}/proyectos?estilo=analitico`, { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("link", { name, exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: `Acciones de «${name}»` }).click();
    await page.getByRole("menuitem", { name: "Eliminar proyecto" }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`¿Eliminar «${name}»?`);
    await expect(dialog).toContainText("Se eliminan también sus 2 tareas y se quita el acceso al portal de sus clientes.");
    await expect(dialog).toContainText("La carpeta de Drive no se borra.");
    const confirm = dialog.getByRole("button", { name: "Eliminar" });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole("textbox", { name: "Nombre del proyecto" }).fill(name);
    await confirm.click();

    await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);
    await expect.poll(() => deletedState(projectId)).toEqual({ project: true, tasks: 2 });

    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => deletedState(projectId)).toEqual({ project: false, tasks: 0 });
  });

  test("deletes from the project header and Restaurar in Ajustes brings it back", async ({ page }) => {
    const { projectId, name } = await seedProject();
    await page.goto(`${BASE_URL}/proyectos/${projectId}`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Más opciones" }).click();
    await page.getByRole("menuitem", { name: "Eliminar proyecto" }).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("textbox", { name: "Nombre del proyecto" }).fill(name);
    await dialog.getByRole("button", { name: "Eliminar" }).click();
    await page.waitForURL(/\/proyectos(\?.*)?$/, { timeout: 15_000 });
    await expect.poll(() => deletedState(projectId)).toEqual({ project: true, tasks: 2 });

    await page.goto(`${BASE_URL}/ajustes/eliminados`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: `Restaurar «${name}»` }).click();
    await expect(page.getByText("Proyecto restaurado. Vuelve a invitar a sus clientes al portal.")).toBeVisible();
    await expect.poll(() => deletedState(projectId)).toEqual({ project: false, tasks: 0 });
  });
});
