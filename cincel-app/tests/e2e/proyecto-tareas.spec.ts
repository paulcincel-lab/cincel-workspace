/**
 * E2E: Proyecto · Tareas tab (redesign FE §3.5, §4.6).
 * Tasks are grouped by fase when the project has fase data, by tramo
 * otherwise; each group shows its progress and "Agregar tarea"; task titles
 * link to `/tareas?tarea=<id>`.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const FASE_PROJECT = `Proyecto Tareas Fase E2E ${RUN_ID}`;
const TRAMO_PROJECT = `Proyecto Tareas Tramo E2E ${RUN_ID}`;
const DONE_TASK = `Tarea completada E2E ${RUN_ID}`;
const OPEN_TASK = `Tarea abierta E2E ${RUN_ID}`;
const TRAMO_TASK = `Tarea sin fase E2E ${RUN_ID}`;
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

type Seeded = { faseProjectId: string; tramoProjectId: string; openTaskId: string; phaseName: string };

let seeded: Promise<Seeded> | null = null;

/** One project with two tasks in Presale · Inicial (one completada), one with a Presale task without fase. */
function seed(): Promise<Seeded> {
  seeded ??= (async () => {
    const sql = postgres(connectionString, { max: 1 });
    try {
      const [admin] = await sql`select id from core.staff where lower(email) = 'paul@cincel.mx' limit 1`;
      const [presale] = await sql`select id from core.workflows where key = 'presale' and deleted_at is null limit 1`;
      if (!admin || !presale) throw new Error("seeded admin/Presale not found");
      const [inicial] = await sql`
        select id, name from core.workflow_phases where workflow_id = ${presale.id} and key = 'inicial' limit 1`;
      if (!inicial) throw new Error("seeded Presale · Inicial fase not found");

      const [faseProject] = await sql`
        insert into core.projects (name, current_workflow_id, status)
        values (${FASE_PROJECT}, ${presale.id}, 'activo') returning id`;
      const [tramoProject] = await sql`
        insert into core.projects (name, current_workflow_id, status)
        values (${TRAMO_PROJECT}, ${presale.id}, 'activo') returning id`;
      await sql`
        insert into core.project_stages (project_id, workflow_id)
        values (${faseProject.id}, ${presale.id}), (${tramoProject.id}, ${presale.id})`;
      await sql`
        insert into core.tasks (project_id, kind, workflow_id, phase_id, title, status, closed_at, created_by_id, manager_id)
        values (${faseProject.id}, 'usuario', ${presale.id}, ${inicial.id}, ${DONE_TASK}, 'completado', now(), ${admin.id}, ${admin.id})`;
      const [open] = await sql`
        insert into core.tasks (project_id, kind, workflow_id, phase_id, title, status, created_by_id, manager_id)
        values (${faseProject.id}, 'usuario', ${presale.id}, ${inicial.id}, ${OPEN_TASK}, 'pendiente', ${admin.id}, ${admin.id})
        returning id`;
      await sql`
        insert into core.tasks (project_id, kind, workflow_id, title, status, created_by_id, manager_id)
        values (${tramoProject.id}, 'usuario', ${presale.id}, ${TRAMO_TASK}, 'pendiente', ${admin.id}, ${admin.id})`;
      return {
        faseProjectId: faseProject.id as string,
        tramoProjectId: tramoProject.id as string,
        openTaskId: open.id as string,
        phaseName: inicial.name as string,
      };
    } finally {
      await sql.end();
    }
  })();
  return seeded;
}

test.describe("Proyecto · Tareas", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("groups by fase with progress, links rows to /tareas and offers Agregar tarea per group", async ({ page }) => {
    const { faseProjectId, openTaskId, phaseName } = await seed();
    await page.goto(`${BASE_URL}/proyectos/${faseProjectId}/tareas`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/proyectos/${faseProjectId}/tareas`));
    await expect(page.getByRole("heading", { name: "Avance por fase" })).toBeVisible({ timeout: 30_000 });

    // One of two tasks is completada → 50 % for the fase.
    await expect(page.getByText(`${phaseName} · 50%`).first()).toBeVisible();
    await expect(page.getByRole("button", { name: `Agregar tarea a ${phaseName}` })).toBeVisible();

    const link = page.getByRole("link", { name: OPEN_TASK });
    await expect(link).toHaveAttribute("href", `/tareas?tarea=${openTaskId}`);
    await expect(page.getByRole("link", { name: DONE_TASK })).toBeVisible();
  });

  test("the Completadas filter keeps only the closed task", async ({ page }) => {
    const { faseProjectId } = await seed();
    await page.goto(`${BASE_URL}/proyectos/${faseProjectId}/tareas?estado=completadas`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: DONE_TASK })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: OPEN_TASK })).toHaveCount(0);
  });

  test("without fase data the tab groups by tramo", async ({ page }) => {
    const { tramoProjectId } = await seed();
    await page.goto(`${BASE_URL}/proyectos/${tramoProjectId}/tareas`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Avance por tramo" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Avance por fase" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: TRAMO_TASK })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agregar tarea a Presale" })).toBeVisible();
  });
});
