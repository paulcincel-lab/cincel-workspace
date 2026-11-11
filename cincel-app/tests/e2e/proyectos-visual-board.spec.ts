/**
 * E2E: /proyectos in Visual (#992, #1042), "Todos los proyectos": every
 * active project is a card in the grid (the "Requieren atención" card, the
 * tramo only as its chip), whatever its tramo; there is no tramo board and no
 * drag. A click on a card opens the project.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";

import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";
import { BASE_URL, withDb } from "./helpers/redesign";

const PROJECT_NAME = `Grid Visual E2E ${Date.now()}`;

let projectId = "";
let tramos: Record<"diseno" | "construccion", string> = { diseno: "", construccion: "" };

/** An active project in Diseño (Construcción started too). */
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

function card(page: Page) {
  return page.locator(`[data-slot="project-grid"] [data-slot="project-card"][data-project="${projectId}"]`);
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

test.describe("Proyectos · Visual · Todos los proyectos", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("the project is a card in the grid with its tramo chip; a click opens it", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos?estilo=visual`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Todos los proyectos" })).toBeVisible({ timeout: 30_000 });
    // No tramo board.
    await expect(page.getByRole("heading", { name: "Tablero del portafolio" })).toHaveCount(0);
    await expect(page.getByText("Arrastra un proyecto para moverlo de tramo")).toHaveCount(0);
    await expect(page.locator('[data-slot="board-column"]')).toHaveCount(0);
    // The summary is about the portfolio, not the tramos.
    const summary = page.getByRole("region", { name: "Resumen del portafolio" });
    await expect(summary.locator('[data-slot="portfolio-summary"]')).toHaveCount(4);

    await expect(card(page)).toBeVisible();
    await expect(card(page).getByText(PROJECT_NAME, { exact: true })).toBeVisible();
    await expect(card(page).getByText("Diseño", { exact: true })).toBeVisible();
    await expect(card(page)).not.toHaveAttribute("draggable", "true");

    await card(page).click();
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}(?:[/?#]|$)`), { timeout: 15_000 });
  });
});
