/**
 * E2E: /proyectos in Visual (#992), "Tablero del portafolio": dragging a
 * project card from Diseño to Construcción moves its current tramo
 * (`setProjectCurrentTramoAction`), and dragging it back restores it. The
 * board updates right away (optimistic) and the database follows.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";

import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";
import { BASE_URL, withDb } from "./helpers/redesign";

const PROJECT_NAME = `Tablero Visual E2E ${Date.now()}`;

let projectId = "";
let tramos: Record<"diseno" | "construccion", string> = { diseno: "", construccion: "" };

/** An active project in Diseño with Construcción already started, so either move is allowed. */
async function seedProject(): Promise<void> {
  await withDb(async (sql) => {
    const rows = await sql<{ id: string; key: string }[]>`
      select id, key from core.workflows where key in ('diseno', 'construccion') and deleted_at is null`;
    tramos = {
      diseno: rows.find((r) => r.key === "diseno")!.id,
      construccion: rows.find((r) => r.key === "construccion")!.id,
    };
    const [project] = await sql<{ id: string }[]>`
      insert into core.projects (name, current_workflow_id, status, address_city)
      values (${PROJECT_NAME}, ${tramos.diseno}, 'activo', 'CDMX')
      returning id`;
    projectId = project.id;
    await sql`
      insert into core.project_stages (project_id, workflow_id)
      values (${projectId}, ${tramos.diseno}), (${projectId}, ${tramos.construccion})`;
  });
}

async function currentTramo(): Promise<string | null> {
  return withDb(async (sql) => {
    const [row] = await sql<{ current_workflow_id: string | null }[]>`
      select current_workflow_id from core.projects where id = ${projectId}`;
    return row?.current_workflow_id ?? null;
  });
}

function column(page: Page, key: "diseno" | "construccion") {
  return page.locator(`[data-slot="board-column"][data-column="${key}"]`);
}

function card(page: Page) {
  return page.locator(`[data-slot="board-card"][data-project="${projectId}"]`);
}

test.beforeAll(async () => {
  await seedProject();
});

test.afterAll(async () => {
  if (!projectId) return;
  await withDb(async (sql) => {
    await sql`delete from core.project_stages where project_id = ${projectId}`;
    await sql`update core.projects set deleted_at = now() where id = ${projectId}`;
  });
});

test.describe("Proyectos · Visual · Tablero del portafolio", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("drags a card from Diseño to Construcción and back", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos?estilo=visual`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Tablero del portafolio" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Arrastra un proyecto para moverlo de tramo")).toBeVisible();
    await expect(column(page, "diseno").locator(card(page))).toBeVisible();

    await card(page).dragTo(column(page, "construccion"));
    await expect(column(page, "construccion").locator(card(page))).toBeVisible({ timeout: 15_000 });
    await expect.poll(currentTramo, { timeout: 15_000 }).toBe(tramos.construccion);

    await card(page).dragTo(column(page, "diseno"));
    await expect(column(page, "diseno").locator(card(page))).toBeVisible({ timeout: 15_000 });
    await expect.poll(currentTramo, { timeout: 15_000 }).toBe(tramos.diseno);
  });
});
