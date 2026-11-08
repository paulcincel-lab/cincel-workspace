/**
 * E2E: /proyectos (FE §3.5): header copy, the three styles from the same
 * data (Estilo switch by keyboard, `?estilo=`), the admin-only
 * "Presup. ejercido" column, and "Nuevo proyecto" opened by `?nuevo=1` with
 * the admin fields; creating opens the new project.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();

test.describe("Proyectos", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("shows the header copy", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/\d+ activos? · avance, fase y entregas de cada obra\./)).toBeVisible();
  });

  test("?nuevo=1 opens Nuevo proyecto with the admin fields, and creating opens the project", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos?nuevo=1`, { waitUntil: "domcontentloaded" });
    const dialog = page.getByRole("dialog", { name: "Nuevo proyecto" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog.getByLabel("Nombre del proyecto")).toBeVisible();
    await expect(dialog.getByLabel("Origen")).toBeVisible();
    await dialog.getByLabel("Nombre del proyecto").fill(`Proyecto E2E rediseño ${RUN_ID}`);
    await dialog.getByLabel("Origen").fill("Recomendación");
    await dialog.getByRole("button", { name: "Crear proyecto" }).click();
    await expect(page).toHaveURL(/\/proyectos\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  });

  test("closing the dialog drops ?nuevo=1", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos?nuevo=1`, { waitUntil: "domcontentloaded" });
    const dialog = page.getByRole("dialog", { name: "Nuevo proyecto" });
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).not.toHaveURL(/nuevo=1/);
  });

  test("Analítico shows the portfolio table with the admin budget column", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos?estilo=analitico`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible({ timeout: 30_000 });
    const empty = page.getByText("Aún no hay proyectos");
    if (await empty.isVisible()) return;
    for (const header of ["Real", "Plan", "Desv.", "Presup. ejercido", "Abiertas", "Vencidas", "Días a entrega", "Próxima entrega"]) {
      await expect(page.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
  });

  test("the Estilo switch changes the style by keyboard without reloading", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos`, { waitUntil: "domcontentloaded" });
    const group = page.getByRole("radiogroup", { name: /Estilo/ });
    await expect(group).toBeVisible({ timeout: 30_000 });
    const checked = group.getByRole("radio", { checked: true });
    const before = await checked.innerText();
    await checked.focus();
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { checked: true })).not.toHaveText(before);
    await expect(page.getByRole("heading", { name: "Proyectos", exact: true })).toBeVisible();
    // Put the saved style back for the other specs.
    await page.keyboard.press("ArrowLeft");
    await expect(group.getByRole("radio", { checked: true })).toHaveText(before);
  });
});
