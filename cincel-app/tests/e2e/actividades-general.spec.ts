/**
 * E2E: Actividades — the General view shows one panel per área plus the
 * tasks with no área, with sortable columns.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT = `Proyecto General E2E ${RUN_ID}`;
const PRESALE_TASK = `Tarea presale E2E ${RUN_ID}`;
const DISENO_TASK = `Tarea diseno E2E ${RUN_ID}`;
const SIN_AREA_TASK = `Tarea sin area E2E ${RUN_ID}`;
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function seed(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [admin] = await sql`select id from core.staff where lower(email) = 'paul@cincel.mx' limit 1`;
    const [presale] = await sql`select id from core.workflows where key = 'presale' limit 1`;
    const [diseno] = await sql`select id from core.workflows where key = 'diseno' limit 1`;
    if (!admin || !presale || !diseno) throw new Error("seeded admin/workflows not found");
    const [client] = await sql`
      insert into core.contacts (type, kind, name) values ('cliente', 'particular', ${`Cliente General E2E ${RUN_ID}`}) returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, current_workflow_id, status)
      values (${PROJECT}, ${client.id}, ${diseno.id}, 'activo') returning id`;
    await sql`
      insert into core.tasks (project_id, kind, workflow_id, title, created_by_id, manager_id)
      values (${project.id}, 'usuario', ${presale.id}, ${PRESALE_TASK}, ${admin.id}, ${admin.id}),
             (${project.id}, 'usuario', ${diseno.id}, ${DISENO_TASK}, ${admin.id}, ${admin.id}),
             (${project.id}, 'usuario', null, ${SIN_AREA_TASK}, ${admin.id}, ${admin.id})`;
  } finally {
    await sql.end();
  }
}

test.describe("Actividades — vista General", () => {
  test("groups every task by área, including the ones with no área", async ({ page }) => {
    await seed();
    await loginAsAdmin(page, BASE_URL);

    // Reachable from the sidebar submenu.
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Actividades" }).click();
    await page.getByRole("link", { name: "General", exact: true }).click();
    await expect(page).toHaveURL(/\/actividades\/general$/, { timeout: 15_000 });

    await page.getByPlaceholder("Buscar tarea...").fill(`E2E ${RUN_ID}`);

    // Each task sits in its own área's panel, and the no-área one in "Sin área".
    await expect(page.getByRole("button", { name: /^Sin área/ })).toBeVisible({ timeout: 15_000 });
    const presalePanel = page.getByRole("region").filter({ hasText: PRESALE_TASK });
    await expect(presalePanel.getByText(DISENO_TASK)).toHaveCount(0);
    await expect(presalePanel.getByText(SIN_AREA_TASK)).toHaveCount(0);
    const sinAreaPanel = page.getByRole("region").filter({ hasText: SIN_AREA_TASK });
    await expect(sinAreaPanel.getByText(PRESALE_TASK)).toHaveCount(0);
    await expect(page.getByRole("region").filter({ hasText: DISENO_TASK })).toBeVisible();

    // The panels mix projects, so rows name theirs; columns sort on click.
    await expect(sinAreaPanel.getByRole("row").filter({ hasText: SIN_AREA_TASK }).getByText(PROJECT)).toBeVisible();
    const titleHeader = sinAreaPanel.getByRole("columnheader", { name: "Tarea" });
    await titleHeader.click();
    await expect(titleHeader).toHaveAttribute("aria-sort", "ascending");
  });
});
