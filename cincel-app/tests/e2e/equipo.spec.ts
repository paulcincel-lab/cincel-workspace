/**
 * E2E: Equipo — add a team member and verify they appear in the list.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const MEMBER_NAME = `Colaborador E2E ${RUN_ID}`;
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

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
    await drawer.locator("label:has-text('Apellidos') + input").fill("E2E");

    // Fill other required fields: Puesto (free text), Áreas (multi-select
    // against real core.areas — search then click the matching option).
    await drawer.locator("label:has-text('Puesto') + input").fill("Arquitecto");
    await drawer.getByPlaceholder("Buscar área...").fill("Diseño");
    await drawer.getByRole("button", { name: /Diseño/ }).click();

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

  test("deactivate a collaborator, find them under Desactivados, and reactivate them", async ({ page }) => {
    // Seeds its own collaborator (tagged E2E so global-cleanup purges it) instead
    // of relying on the test above — a retry runs in a fresh worker with a new RUN_ID.
    const name = `Baja E2E ${Date.now()}`;
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`insert into core.staff (name, email, role, capacity, active) values (${name}, ${`baja.${Date.now()}@cincel.test`}, 'Colaborador', 8, true)`;
    } finally {
      await sql.end();
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 });
    // The page's own refresh() (areas, tasks, projects) re-renders the table
    // as each fetch lands, which would detach an already-open row menu.
    await page.waitForLoadState("networkidle");

    const rowMenu = (who: string) => page.getByRole("row").filter({ hasText: who }).getByLabel("Acciones");

    page.once("dialog", (dialog) => void dialog.accept());
    await rowMenu(name).click();
    await page.getByRole("menuitem", { name: "Desactivar" }).click();

    // Gone from Activos…
    await expect(page.getByText(name)).toHaveCount(0, { timeout: 15_000 });

    // …present under Desactivados, where the same menu now offers Reactivar.
    await page.getByRole("tab", { name: "Desactivados" }).click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });

    page.once("dialog", (dialog) => void dialog.accept());
    await rowMenu(name).click();
    await page.getByRole("menuitem", { name: "Reactivar" }).click();
    await expect(page.getByText(name)).toHaveCount(0, { timeout: 15_000 });
  });

  test("admins see each collaborator's emergency contact with a call link (#451)", async ({ page }) => {
    const withContact = `Con emergencia E2E ${RUN_ID}`;
    const withoutContact = `Sin emergencia E2E ${RUN_ID}`;
    const sql = postgres(connectionString, { max: 1 });
    try {
      const [member] = await sql`
        insert into core.staff (name, kind, capacity) values (${withContact}, 'empleado', 5) returning id`;
      await sql`
        insert into core.staff_profiles (staff_id, emergency_contact_name, emergency_contact_relation, emergency_contact_phone)
        values (${member.id}, 'Lucía Pérez', 'Madre', '+52 55 1234 5678')`;
      await sql`insert into core.staff (name, kind, capacity) values (${withoutContact}, 'empleado', 5)`;
    } finally {
      await sql.end();
    }

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("columnheader", { name: "Emergencia" })).toBeVisible({ timeout: 30_000 });

    const row = page.getByRole("row").filter({ hasText: withContact });
    await expect(row.getByText("Lucía Pérez")).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("· Madre")).toBeVisible();
    await expect(row.getByRole("link", { name: `Llamar al contacto de emergencia de ${withContact}` })).toHaveAttribute(
      "href",
      "tel:+525512345678"
    );

    await expect(page.getByRole("row").filter({ hasText: withoutContact }).getByText("Sin registrar")).toBeVisible();
  });

  test("admins reorder the team by dragging, and the order persists (#452)", async ({ page }) => {
    const first = `Orden A E2E ${RUN_ID}`;
    const second = `Orden B E2E ${RUN_ID}`;
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`insert into core.staff (name, kind, capacity) values (${first}, 'empleado', 5), (${second}, 'empleado', 5)`;
    } finally {
      await sql.end();
    }
    await page.reload({ waitUntil: "domcontentloaded" });

    const rowOf = (name: string) => page.getByRole("row").filter({ hasText: name });
    const indexOf = async (name: string) => {
      const names = await page.getByRole("row").allInnerTexts();
      return names.findIndex((text) => text.includes(name));
    };
    await expect(rowOf(second)).toBeVisible({ timeout: 30_000 });
    // Never placed: alphabetical, A before B.
    expect(await indexOf(first)).toBeLessThan(await indexOf(second));

    // Drag B's handle onto A's row (fired directly: a mouse drag inside a scrolling table is flaky).
    await rowOf(second).getByTitle("Arrastra para reordenar").dispatchEvent("dragstart");
    await rowOf(first).dispatchEvent("dragover");
    await rowOf(first).dispatchEvent("drop");
    await expect.poll(async () => (await indexOf(second)) < (await indexOf(first))).toBe(true);

    // Saved server-side (reloading earlier would cancel the in-flight save).
    await expect
      .poll(async () => {
        const db = postgres(connectionString, { max: 1 });
        try {
          const rows = await db`select name, sort_order from core.staff where name in (${first}, ${second})`;
          const order = Object.fromEntries(rows.map((r) => [r.name, r.sort_order]));
          return order[second] !== null && order[first] !== null && order[second] < order[first];
        } finally {
          await db.end();
        }
      })
      .toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(rowOf(second)).toBeVisible({ timeout: 30_000 });
    expect(await indexOf(second)).toBeLessThan(await indexOf(first));
  });
});
