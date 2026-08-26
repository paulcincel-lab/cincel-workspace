/**
 * E2E: Equipo — add a team member and verify they appear in the list.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const MEMBER_NAME = `Colaborador E2E ${RUN_ID}`;

test.describe("Equipo — add team member", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/equipo`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Agregar colaborador/i })).toBeVisible({ timeout: 30_000 });
  });

  test("create a collaborator and verify it persists in the list", async ({ page }) => {
    await page.getByRole("button", { name: /Agregar colaborador/i }).click();
    await page.getByRole("heading", { name: "Agregar colaborador" }).waitFor({ state: "visible", timeout: 15_000 });

    const drawer = page.locator("div.fixed").filter({ has: page.getByRole("heading", { name: "Agregar colaborador" }) });

    // Labels in this form are NOT connected via htmlFor — use CSS adjacent-sibling.
    // "Nombre" appears in both "Información laboral" and "Contacto de emergencia" sections;
    // target the first occurrence which is the collaborator's name field.
    await drawer.locator("label:has-text('Nombre') + input").first().fill(MEMBER_NAME);

    // Fill other required fields: Puesto, Area — each label is unique
    await drawer.locator("label:has-text('Puesto') + input").fill("Arquitecto");
    await drawer.locator("label:has-text('Area') + input").fill("Diseño");

    // Correo institucional is type=email and mandatory for system access validation
    const emailInput = drawer.locator("input[type=email]").first();
    await emailInput.scrollIntoViewIfNeeded();
    await emailInput.fill(`e2e.${RUN_ID}@cincel.test`);

    // Scroll the Guardar button into view within the scrollable drawer and click
    const saveBtn = drawer.getByRole("button", { name: "Guardar" });
    await saveBtn.click({ force: true });

    // The editor panel should close
    await page.getByRole("heading", { name: "Agregar colaborador" }).waitFor({ state: "hidden", timeout: 15_000 });

    // The new member should appear in the list (name can appear in multiple elements — first is enough)
    await expect(page.getByText(MEMBER_NAME).first()).toBeVisible({ timeout: 15_000 });
  });
});
