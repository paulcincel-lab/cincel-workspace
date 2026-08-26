/**
 * E2E: Clientes — full CRUD cycle (create, read, update, delete).
 *
 * Auth note: `seedAuth` injects a fixture member record so the real
 * `loginWithEmailAndPassword` in `lib/auth/auth-service.ts` can verify
 * credentials. `loginAsAdmin` then fills and submits the real login form —
 * no session is pre-injected; the form submission performs the actual hash
 * comparison. See `helpers/seed-auth.ts` for a detailed explanation of what
 * is and isn't covered without a live Supabase project.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared
 * staging) — this test writes synthetic PII-shaped data and deletes it on
 * teardown, but it must not pollute a shared project.
 */
import { test, expect } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const TEST_CLIENT_NAME = `Cliente E2E ${RUN_ID}`;
const EDITED_CLIENT_NAME = `${TEST_CLIENT_NAME} Editado`;

test.describe("Clientes — CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/clientes`, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll("h1"))
            .map((el) => (el.textContent ?? "").trim())
            .includes("Clientes"),
        { timeout: 60_000 }
      )
      .catch(async () => {
        const url = page.url();
        const h1Texts = await page.locator("h1").allTextContents();
        throw new Error(
          `Clientes page did not load (url=${url}, h1=${JSON.stringify(h1Texts)})`
        );
      });
  });

  test("create, edit and delete a client", async ({ page }) => {
    // --- Create ---
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    await page
      .getByRole("heading", { name: "Nuevo cliente" })
      .waitFor({ state: "visible" });

    const createPanel = page
      .locator("div", {
        has: page.getByRole("heading", { name: "Nuevo cliente" }),
      })
      .first();

    await createPanel.getByLabel("Nombre del cliente").fill(TEST_CLIENT_NAME);
    await createPanel.getByLabel("Numero de contacto").fill("+52 646 000 9999");
    await createPanel
      .getByLabel("Email(s)")
      .fill(`e2e.${RUN_ID}@cincel.test`);
    await createPanel.getByLabel("Empresa o Particular").selectOption("Empresa");
    await createPanel.getByLabel("Proyecto activo").selectOption("no");
    await createPanel
      .getByLabel("Nombre del proyecto")
      .fill(`Proyecto E2E ${RUN_ID}`);
    await createPanel
      .getByLabel("Numero de proyectos con nosotros")
      .fill("1");
    await page.getByRole("button", { name: "Crear cliente" }).click();

    await page
      .getByRole("heading", { name: "Nuevo cliente" })
      .waitFor({ state: "hidden", timeout: 20_000 })
      .catch(() => {
        throw new Error("Create modal did not close after submitting");
      });

    await page
      .getByPlaceholder("Buscar por cliente, proyecto o tipo")
      .fill(TEST_CLIENT_NAME);

    const createdRow = page.locator("tr", { hasText: TEST_CLIENT_NAME }).first();
    await createdRow
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(async () => {
        const rows = await page.locator("tr").allTextContents();
        throw new Error(`Client was not created (rows=${rows.length})`);
      });

    // --- Edit ---
    await createdRow.getByRole("link", { name: "Ver ficha" }).click();
    await page
      .waitForURL(/\/clientes\/\d+/, { timeout: 30_000 })
      .catch(() => {
        throw new Error("Client detail page did not open");
      });

    const editButton = page
      .getByRole("button", { name: "Editar cliente" })
      .first();
    await editButton
      .waitFor({ state: "visible", timeout: 60_000 })
      .catch(async () => {
        const url = page.url();
        const h1s = await page.locator("h1").allTextContents();
        throw new Error(
          `Edit button not visible (url=${url}, h1=${JSON.stringify(h1s)})`
        );
      });
    await editButton.click();

    await page
      .getByRole("heading", { name: "Editar cliente" })
      .waitFor({ state: "visible" });

    const editPanel = page
      .locator("div", {
        has: page.getByRole("heading", { name: "Editar cliente" }),
      })
      .first();

    await editPanel.getByLabel("Nombre del cliente").fill(EDITED_CLIENT_NAME);
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(
      page.getByRole("heading", { name: EDITED_CLIENT_NAME })
    ).toBeVisible({ timeout: 15_000 });

    // --- Delete (teardown — removes synthetic data) ---
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Eliminar cliente" }).click();

    await page.waitForTimeout(1_200);
    await page.goto(`${BASE_URL}/clientes`, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll("h1"))
            .map((el) => (el.textContent ?? "").trim())
            .includes("Clientes"),
        { timeout: 30_000 }
      )
      .catch(() => {
        throw new Error("Clientes list did not reload after delete");
      });

    await page
      .getByPlaceholder("Buscar por cliente, proyecto o tipo")
      .fill(EDITED_CLIENT_NAME);

    await expect(
      page.locator("tr", { hasText: EDITED_CLIENT_NAME })
    ).toHaveCount(0, { timeout: 10_000 });
  });
});
