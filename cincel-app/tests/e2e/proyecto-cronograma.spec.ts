/**
 * E2E: Cronograma (Query Migration 5c, #961; regression for #947). A status
 * change on a week-board card keeps its new value after the save settles and
 * after a reload; week navigation writes `?week=` without a server render.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Request } from "@playwright/test";
import postgres from "postgres";

import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";
const RUN = Date.now();
const PROJECT_NAME = `Proyecto Cronograma E2E ${RUN}`;
const TASK_NAME = `Trazo y nivelación E2E ${RUN}`;

let projectId = "";

/** `YYYY-MM-DD` of today plus `days`, in the schedule timezone. */
function isoDay(days: number): string {
  const at = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** A project with a schedule of one pending task that runs through this week. */
async function seedProject(): Promise<string> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [project] = await sql`
      insert into core.projects (name, status) values (${PROJECT_NAME}, 'activo') returning id`;
    const [schedule] = await sql`
      insert into core.project_schedules (project_id) values (${project.id}) returning id`;
    await sql`
      insert into core.schedule_tasks
        (schedule_id, stable_key, planta, seccion, seccion_order, inicio, fin, tarea, status, sort_order)
      values
        (${schedule.id}, ${`PB-e2e-${RUN}`}, 'PB', 'Preliminares', 0, ${isoDay(-1)}, ${isoDay(2)}, ${TASK_NAME}, 'pending', 0)`;
    return project.id as string;
  } finally {
    await sql.end();
  }
}

const isRscRequest = (request: Request) => request.url().includes("_rsc=") || request.headers()["rsc"] === "1";
const isActionPost = (request: Request) => request.method() === "POST" && Boolean(request.headers()["next-action"]);

test.beforeAll(async () => {
  projectId = await seedProject();
});

test.describe("Proyecto · Cronograma", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("a status change stays after the save and after a reload (#947)", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}/cronograma?estilo=visual`, { waitUntil: "networkidle" });
    const card = page.locator("div", { hasText: TASK_NAME }).filter({ has: page.getByRole("button", { name: /^Estado:/ }) }).last();
    await expect(card.getByRole("button", { name: /^Estado: Pendiente/ })).toBeVisible({ timeout: 30_000 });

    const rsc: string[] = [];
    page.on("request", (request) => {
      if (isRscRequest(request)) rsc.push(request.url());
    });

    await test.step("change the status: one action POST, no server render", async () => {
      const saved = page.waitForResponse((response) => isActionPost(response.request()));
      await card.getByRole("button", { name: /^Estado: Pendiente/ }).click();
      await expect(card.getByRole("button", { name: /^Estado: En proceso/ })).toBeVisible();
      await saved;
      await page.waitForLoadState("networkidle");
      // The value is still the new one once the save has settled.
      await expect(card.getByRole("button", { name: /^Estado: En proceso/ })).toBeVisible();
      expect(rsc).toEqual([]);
    });

    await test.step("reload: the value is kept", async () => {
      await page.reload({ waitUntil: "networkidle" });
      const reloaded = page
        .locator("div", { hasText: TASK_NAME })
        .filter({ has: page.getByRole("button", { name: /^Estado:/ }) })
        .last();
      await expect(reloaded.getByRole("button", { name: /^Estado: En proceso/ })).toBeVisible({ timeout: 30_000 });
    });
  });

  test("week navigation writes ?week= with no server render and no action call", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${projectId}/cronograma?estilo=visual`, { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "→" })).toBeVisible({ timeout: 30_000 });

    const requests: string[] = [];
    page.on("request", (request) => {
      if (isRscRequest(request) || isActionPost(request)) requests.push(`${request.method()} ${request.url()}`);
    });

    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "→" }).click();
    await expect(page).toHaveURL(/[?&]week=3(&|$)/);
    await expect(page.getByText("+3 semana(s) desde hoy")).toBeVisible();

    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "←" }).click();
    await expect(page).not.toHaveURL(/[?&]week=/);
    await expect(page.getByText("semana actual")).toBeVisible();

    await page.waitForLoadState("networkidle");
    expect(requests).toEqual([]);
  });
});
