/**
 * E2E: Equipo with Puestos (Project Flow FE §3.10, §15). `/equipo` lives at
 * Personas · Equipo. A person's job position comes from the Puestos catalog
 * and shows under "Puesto"; the access role ("Acceso") is a separate field
 * of the collaborator editor and never shows as the puesto. There is no
 * "Áreas" field or column anymore, and picking a puesto shows its candidate
 * fases as "{tramo} · {fase}".
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";

import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";
import { BASE_URL, createStaffUser, withDb, type E2EUser } from "./helpers/redesign";

const RUN_ID = Date.now();
const PUESTO = `Puesto E2E ${RUN_ID}`;

/** Matches the old "Área" / "Áreas" label. */
const AREAS = /^Áreas?$/;

let member: E2EUser;
/** The candidate fase linked to the puesto, as the editor prints it: "{tramo} · {fase}". */
let candidateLabel = "";

/** A puesto with one candidate fase (the first Presale fase) and a Colaborador who holds it. */
async function seedPuestoAndMember(): Promise<void> {
  member = await createStaffUser({ tag: "Equipo", role: "Colaborador" });
  await withDb(async (sql) => {
    const [phase] = await sql<{ id: string; name: string; tramo: string }[]>`
      select p.id, p.name, w.name as tramo
      from core.workflow_phases p join core.workflows w on w.id = p.workflow_id
      where w.key = 'presale' and w.deleted_at is null and p.active
      order by p.sort_order limit 1`;
    if (!phase) throw new Error("seeded Presale fases not found");
    candidateLabel = `${phase.tramo} · ${phase.name}`;
    const [position] = await sql<{ id: string }[]>`
      insert into core.positions (name, sort_order, active) values (${PUESTO}, 999, true) returning id`;
    await sql`insert into core.position_phases (position_id, phase_id) values (${position.id}, ${phase.id})`;
    await sql`insert into core.staff_positions (staff_id, position_id) values (${member.staffId}, ${position.id})`;
  });
}

test.beforeAll(async () => {
  await seedPuestoAndMember();
});

test.describe("Equipo · Puestos y Acceso", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("/equipo opens Personas · Equipo", async ({ page }) => {
    await page.goto(`${BASE_URL}/equipo`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/personas(\?|$)/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Personas", level: 1 })).toBeVisible({ timeout: 30_000 });
  });

  test("the team table shows the puesto under Puesto, never the access role, and has no Áreas column", async ({ page }) => {
    await page.goto(`${BASE_URL}/personas?estilo=analitico`, { waitUntil: "domcontentloaded" });
    const table = page.getByRole("table", { name: "Personas por tramo" });
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(table.getByRole("columnheader", { name: "Puesto", exact: true })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: AREAS })).toHaveCount(0);
    await expect(table.getByRole("columnheader", { name: "Acceso", exact: true })).toHaveCount(0);

    await page.getByLabel("Buscar personas").fill(member.name);
    const row = table.getByRole("row").filter({ has: page.getByRole("link", { name: member.name }) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByRole("cell", { name: PUESTO })).toBeVisible();
    await expect(row.getByText("Colaborador", { exact: true })).toHaveCount(0);
  });

  test("the persona detail names the puesto, not the access role", async ({ page }) => {
    await page.goto(`${BASE_URL}/personas/equipo/${member.staffId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(member.name) })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(PUESTO).first()).toBeVisible();
    await expect(page.getByText("Colaborador", { exact: true })).toHaveCount(0);
  });

  test("the collaborator editor has Puestos and Acceso as separate fields and derives the candidate fases", async ({ page }) => {
    await page.goto(`${BASE_URL}/personas`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Agregar persona" }).click();
    const sheet = page.getByRole("dialog", { name: "Agregar colaborador" });
    await expect(sheet).toBeVisible({ timeout: 15_000 });

    await expect(sheet.getByText("Puestos", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("combobox", { name: "Acceso" })).toBeVisible();
    await expect(sheet.getByText(AREAS)).toHaveCount(0);
    const candidates = sheet.getByTestId("member-candidate-phases");
    await expect(candidates).toHaveText("Fases candidatas: ninguna");

    // The puestos catalog loads while the editor is open.
    const search = sheet.getByRole("textbox", { name: "Buscar puesto..." });
    await expect(search).toBeVisible({ timeout: 15_000 });
    await search.fill(PUESTO);
    await sheet.getByRole("button", { name: PUESTO }).first().click();
    await expect(candidates).toHaveText(`Fases candidatas: ${candidateLabel}`);

    // Close without saving.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });
});
