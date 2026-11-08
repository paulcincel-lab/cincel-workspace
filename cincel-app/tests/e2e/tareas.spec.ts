/**
 * E2E: "Mis tareas" is the Lista view of `/tareas` with "Responsable: Yo"
 * (redesign FE §2.2, §3.4).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

/**
 * A fresh DB (scripts/seed.ts) seeds no projects at all, so this spec seeds
 * its own client + active "presale" project directly, tagged "E2E" so
 * global-cleanup.ts purges it like every other spec's rows.
 */
// Every test in this file shares the same RUN_ID and calls this from its own
// beforeEach — memoize so the client/project are only ever inserted once per
// run, instead of every test's beforeEach re-inserting the same name and
// hitting contacts_type_name_lower_uq.
let presaleProjectReady: Promise<void> | null = null;

async function ensurePresaleProject(): Promise<void> {
  presaleProjectReady ??= (async () => {
    const sql = postgres(connectionString, { max: 1 });
    try {
      const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
      if (!workflow) throw new Error("presale workflow not seeded");
      const [client] = await sql`
        insert into core.contacts (type, kind, name)
        values ('cliente', 'particular', ${`Cliente E2E ${RUN_ID}`})
        returning id
      `;
      await sql`
        insert into core.projects (name, client_id, current_workflow_id, status)
        values (${`Proyecto E2E ${RUN_ID}`}, ${client.id}, ${workflow.id}, 'activo')
      `;
    } finally {
      await sql.end();
    }
  })();
  return presaleProjectReady;
}

test.describe("Mis tareas (/tareas?vista=lista&responsable=yo)", () => {
  test.beforeEach(async ({ page }) => {
    await ensurePresaleProject();
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("/mis-tareas redirects to the Lista view with Responsable: Yo", async ({ page }) => {
    await page.goto(`${BASE_URL}/mis-tareas`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tareas\?/, { timeout: 30_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get("vista")).toBe("lista");
    expect(url.searchParams.get("responsable")).toBe("yo");
    await expect(page.getByRole("heading", { name: "Tareas", exact: true })).toBeVisible({ timeout: 30_000 });
  });

  test("my open tasks are listed and completed ones stay collapsed under Completado", async ({ page }) => {
    const openTitle = `Mi tarea abierta flag E2E ${RUN_ID}`;
    const doneTitle = `Mi tarea cerrada flag E2E ${RUN_ID}`;
    const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx";
    const sql = postgres(connectionString, { max: 1 });
    try {
      for (const [title, status] of [
        [openTitle, "pendiente"],
        [doneTitle, "completado"],
      ] as const) {
        await sql`
          insert into core.tasks (project_id, workflow_id, kind, title, status, created_by_id, manager_id)
          select p.id, p.current_workflow_id, 'usuario', ${title}, ${status}, s.id, s.id
          from core.projects p, core.staff s
          where p.name = ${`Proyecto E2E ${RUN_ID}`} and lower(s.email) = lower(${adminEmail}) and s.deleted_at is null`;
      }
    } finally {
      await sql.end();
    }

    await page.goto(`${BASE_URL}/tareas?vista=lista&responsable=yo&q=${encodeURIComponent(`flag E2E ${RUN_ID}`)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("link", { name: openTitle })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(doneTitle)).toBeHidden();

    // Completado is collapsed with its count; opening it shows the closed task.
    const completadoToggle = page
      .getByRole("button", { name: /^Completado/ })
      .or(page.locator("summary").filter({ hasText: /^Completado/ }))
      .first();
    await completadoToggle.click();
    await expect(page.getByRole("link", { name: doneTitle })).toBeVisible({ timeout: 15_000 });

    // The filters live in the URL (FE §3.4): a reload keeps the same rows.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: openTitle })).toBeVisible({ timeout: 30_000 });
  });
});
