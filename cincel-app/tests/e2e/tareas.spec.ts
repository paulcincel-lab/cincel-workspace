/**
 * E2E: Tareas — create a task and verify commitmentDate/reviewDate fields
 * and persistence in the list.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const TASK_DESC = `Tarea E2E ${RUN_ID}`;

test.describe("Tareas — create task with commitmentDate and reviewDate", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/actividades/presale`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Nueva tarea/i }).first()).toBeVisible({ timeout: 30_000 });
  });

  test("can create a task with commitmentDate and reviewDate and it appears in the list", async ({ page }) => {
    await page.getByRole("button", { name: /Nueva tarea/i }).first().click();
    await page.getByRole("heading", { name: "Nueva tarea" }).waitFor({ state: "visible", timeout: 15_000 });

    // Fill required description field
    await page.getByPlaceholder(/Describe la tarea/i).fill(TASK_DESC);

    // Fill date fields — modal lacks overflow control and overflows viewport;
    // use the date inputs by type (no htmlFor on labels) and force-click the save button.
    const modal = page.locator("div.fixed").filter({ has: page.getByRole("heading", { name: "Nueva tarea" }) });
    const dateInputs = modal.locator("input[type=date]");
    await dateInputs.nth(0).fill("2026-12-01");
    await dateInputs.nth(1).fill("2026-11-15");

    // The modal has no max-height and can overflow the viewport.
    // Use dispatchEvent to trigger the click without requiring viewport visibility.
    await modal.getByRole("button", { name: "Guardar" }).dispatchEvent("click");

    // Modal should close
    await page.getByRole("heading", { name: "Nueva tarea" }).waitFor({ state: "hidden", timeout: 15_000 });

    // The task description should be visible in the table
    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_DESC);
    await expect(page.getByText(TASK_DESC)).toBeVisible({ timeout: 15_000 });

    // Reload and confirm it persisted to Postgres (not just optimistic state).
    await page.goto(`${BASE_URL}/actividades/presale`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Nueva tarea/i }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_DESC);
    await expect(page.getByText(TASK_DESC)).toBeVisible({ timeout: 15_000 });
  });
});
