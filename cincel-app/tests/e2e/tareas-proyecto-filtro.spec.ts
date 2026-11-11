/**
 * E2E: Tareas › Analítico, the Proyecto filter (#1045). Picking two of three
 * projects shows only their tasks and writes `?proyecto=<id>,<id>`; a chip
 * removes one; "Todos" clears the filter.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const RUN_ID = Date.now();
const MARKER = `Filtro E2E ${RUN_ID}`;

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

type Seeded = { id: string; name: string; task: string };

/** Three active presale projects (tagged E2E for global-cleanup), one open task each. */
async function seedProjects(): Promise<Seeded[]> {
  return withSql(async (sql) => {
    const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    if (!workflow) throw new Error("presale workflow not seeded");
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${`Cliente ${MARKER}`})
      returning id`;
    const out: Seeded[] = [];
    for (const letter of ["A", "B", "C"]) {
      const name = `Proyecto ${letter} ${MARKER}`;
      const task = `Tarea ${letter} ${MARKER}`;
      const [project] = await sql`
        insert into core.projects (name, client_id, current_workflow_id, status)
        values (${name}, ${client.id}, ${workflow.id}, 'activo')
        returning id`;
      await sql`
        insert into core.tasks (project_id, kind, workflow_id, title, status, created_by_id)
        select p.id, 'usuario', p.current_workflow_id, ${task}, 'pendiente',
               (select id from core.staff where deleted_at is null order by created_at limit 1)
        from core.projects p where p.id = ${project.id}`;
      out.push({ id: project.id as string, name, task });
    }
    return out;
  });
}

test.describe("Tareas · Proyecto filter", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("filters by several projects through the URL, chips remove one, Todos clears it", async ({ page }) => {
    const [a, b, c] = await seedProjects();
    // The search narrows the page to this run's tasks.
    await page.goto(`${BASE_URL}/tareas?estilo=analitico&q=${encodeURIComponent(MARKER)}`, { waitUntil: "domcontentloaded" });

    const table = page.locator(`[data-slot="tareas-analitico"]`);
    for (const p of [a, b, c]) await expect(table.getByText(p.task)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /^Proyecto:/ }).click();
    const search = page.getByRole("combobox");
    await search.fill(MARKER);
    await page.getByRole("option", { name: new RegExp(`^${a.name}`) }).click();
    await page.getByRole("option", { name: new RegExp(`^${b.name}`) }).click();
    await page.keyboard.press("Escape");

    const ids = [a.id, b.id].sort().join(",");
    await expect(page).toHaveURL(new RegExp(`[?&]proyecto=${ids}`));
    await expect(table.getByText(a.task)).toBeVisible({ timeout: 15_000 });
    await expect(table.getByText(b.task)).toBeVisible();
    await expect(table.getByText(c.task)).toHaveCount(0);

    // A chip removes one project.
    await page.getByRole("button", { name: `Quitar ${a.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]proyecto=${b.id}(&|$)`));
    await expect(table.getByText(a.task)).toHaveCount(0, { timeout: 15_000 });
    await expect(table.getByText(b.task)).toBeVisible();

    // "Todos" clears the filter.
    await page.getByRole("button", { name: /^Proyecto:/ }).click();
    await page.getByRole("option", { name: "Todos" }).click();
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/[?&]proyecto=/);
    for (const p of [a, b, c]) await expect(table.getByText(p.task)).toBeVisible({ timeout: 15_000 });
  });
});
