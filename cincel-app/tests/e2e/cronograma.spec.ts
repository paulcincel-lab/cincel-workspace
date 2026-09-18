/**
 * E2E: Cronograma de Obra — a status change made in one browser context is
 * visible to another context after reload (Phase 3 Done Definition).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT_NAME = `Cronograma E2E ${RUN_ID}`;
const CLIENT_NAME = `Cliente Cronograma E2E ${RUN_ID}`;
const TASK_TEXT = `Tarea E2E ${RUN_ID} — instalación de prueba`;

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function seedScheduleFixture(): Promise<string> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [client] = await sql`
      insert into core.contacts (type, kind, name) values ('cliente', 'empresa', ${CLIENT_NAME}) returning id
    `;
    const [project] = await sql`
      insert into core.projects (name, client_id, status) values (${PROJECT_NAME}, ${client.id}, 'activo') returning id
    `;
    const [schedule] = await sql`
      insert into core.project_schedules (project_id, version) values (${project.id}, 1) returning id
    `;
    await sql`
      insert into core.schedule_tasks
        (schedule_id, stable_key, planta, seccion, seccion_order, responsable, inicio, fin, tarea, status, sort_order)
      values
        (${schedule.id}, ${`E2E-${RUN_ID}`}, 'PB', 'Preliminares', 0, 'Chava', current_date, current_date, ${TASK_TEXT}, 'pending', 0)
    `;
    return project.id as string;
  } finally {
    await sql.end();
  }
}

test.describe("Cronograma — status change is visible across sessions", () => {
  test("marking a task done in one context shows up in another after reload", async ({ browser }) => {
    const projectId = await seedScheduleFixture();

    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await loginAsAdmin(pageA, BASE_URL);
    await pageA.goto(`${BASE_URL}/proyectos/${projectId}/cronograma`, { waitUntil: "load" });

    const taskCardA = pageA.locator("div").filter({ hasText: TASK_TEXT }).first();
    await expect(taskCardA).toBeVisible({ timeout: 20_000 });
    // The task's 5-day span can overlap two week columns, so it may render
    // twice (e.g. "Esta semana" and "Próxima semana") — click the first.
    await taskCardA.getByRole("button", { name: /Estado: Pendiente/ }).first().click();

    // Optimistic update should show immediately in context A.
    await expect(taskCardA.getByRole("button", { name: /Estado: En proceso/ }).first()).toBeVisible({ timeout: 10_000 });

    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await loginAsAdmin(pageB, BASE_URL);
    await pageB.goto(`${BASE_URL}/proyectos/${projectId}/cronograma`, { waitUntil: "load" });

    const taskCardB = pageB.locator("div").filter({ hasText: TASK_TEXT }).first();
    await expect(taskCardB.getByRole("button", { name: /Estado: En proceso/ }).first()).toBeVisible({ timeout: 20_000 });

    await contextA.close();
    await contextB.close();
  });
});
