/**
 * E2E: Directorio — Cliente CRUD cycle (create, view ficha, edit, delete) and
 * a Contratista persistence check (contractors/colaboradores/tiendas share
 * the same repository + action shape, so one representative type suffices).
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
import { test, expect, type Page } from "@playwright/test";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const TEST_CLIENT_NAME = `Cliente E2E ${RUN_ID}`;
const EDITED_CLIENT_NAME = `${TEST_CLIENT_NAME} Editado`;
const PROVIDER_NAME = `Proveedor E2E ${RUN_ID}`;

/**
 * ContactEditorSheet's <Label> elements aren't wired to their fields via
 * htmlFor/id (plain sibling markup), so getByLabel doesn't work. Each field
 * lives in its own wrapping <div> with the label text and nothing else
 * matching it more deeply — `.last()` picks the innermost (most specific)
 * match among ancestor divs that also contain the text.
 */
function fieldContainer(page: Page, labelText: string) {
  return page.locator("div").filter({ has: page.getByText(labelText, { exact: true }) }).last();
}

test.describe("Directorio", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/directorio`, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll("h1"))
            .map((el) => (el.textContent ?? "").trim())
            .includes("Directorio"),
        { timeout: 60_000 }
      )
      .catch(async () => {
        const url = page.url();
        const h1Texts = await page.locator("h1").allTextContents();
        throw new Error(
          `Directorio page did not load (url=${url}, h1=${JSON.stringify(h1Texts)})`
        );
      });
  });

  test("create, view ficha, edit and delete a client", async ({ page }) => {
    // --- Create (the editor Sheet defaults to type "Cliente") ---
    await page.getByRole("button", { name: "+ Nuevo contacto" }).click();
    await page.getByRole("heading", { name: "Nuevo contacto" }).waitFor({ state: "visible" });

    await fieldContainer(page, "Nombre").locator("input").fill(TEST_CLIENT_NAME);
    await fieldContainer(page, "Teléfono").locator("input").fill("+52 646 000 9999");
    await fieldContainer(page, "Email(s)").locator("input").fill(`e2e.${RUN_ID}@cincel.test`);
    await page.getByRole("button", { name: "Guardar" }).click();

    await page
      .getByRole("heading", { name: "Nuevo contacto" })
      .waitFor({ state: "hidden", timeout: 20_000 })
      .catch(() => {
        throw new Error("Create sheet did not close after submitting");
      });

    await page.getByPlaceholder("Buscar en el directorio…").fill(TEST_CLIENT_NAME);

    const createdRow = page.locator("tr", { hasText: TEST_CLIENT_NAME }).first();
    await createdRow
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(async () => {
        const rows = await page.locator("tr").allTextContents();
        throw new Error(`Client was not created (rows=${rows.length})`);
      });

    // --- View ficha ---
    await createdRow.getByRole("button", { name: "Acciones" }).click();
    await page.getByRole("menuitem", { name: "Ver ficha" }).click();
    await expect(page.getByRole("heading", { name: "Ficha del cliente" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(TEST_CLIENT_NAME).first()).toBeVisible();

    // --- Edit (from within the ficha sheet) ---
    await page.getByRole("button", { name: "Editar" }).click();
    await page.getByRole("heading", { name: "Editar contacto" }).waitFor({ state: "visible" });

    await fieldContainer(page, "Nombre").locator("input").fill(EDITED_CLIENT_NAME);
    await page.getByRole("button", { name: "Guardar" }).click();
    await page
      .getByRole("heading", { name: "Editar contacto" })
      .waitFor({ state: "hidden", timeout: 20_000 });

    await page.getByPlaceholder("Buscar en el directorio…").fill(EDITED_CLIENT_NAME);
    await expect(page.locator("tr", { hasText: EDITED_CLIENT_NAME })).toBeVisible({ timeout: 15_000 });

    // --- Delete (teardown — removes synthetic data) ---
    const editedRow = page.locator("tr", { hasText: EDITED_CLIENT_NAME }).first();
    page.once("dialog", (dialog) => dialog.accept());
    await editedRow.getByRole("button", { name: "Acciones" }).click();
    await page.getByRole("menuitem", { name: "Eliminar" }).click();

    await page.waitForTimeout(1_200);
    await page.getByPlaceholder("Buscar en el directorio…").fill(EDITED_CLIENT_NAME);
    await expect(page.locator("tr", { hasText: EDITED_CLIENT_NAME })).toHaveCount(0, { timeout: 10_000 });
  });

  test("create a contractor and verify it persists after reload", async ({ page }) => {
    await page.getByRole("button", { name: "+ Nuevo contacto" }).click();
    await page.getByRole("heading", { name: "Nuevo contacto" }).waitFor({ state: "visible" });

    await fieldContainer(page, "Tipo de contacto").getByRole("combobox").click();
    await page.getByRole("option", { name: "Contratista", exact: true }).click();
    await fieldContainer(page, "Nombre").locator("input").fill(PROVIDER_NAME);
    await page.getByRole("button", { name: "Guardar" }).click();

    await page
      .getByRole("heading", { name: "Nuevo contacto" })
      .waitFor({ state: "hidden", timeout: 20_000 });

    await page.getByPlaceholder("Buscar en el directorio…").fill(PROVIDER_NAME);
    await expect(page.locator("tr", { hasText: PROVIDER_NAME })).toBeVisible({ timeout: 15_000 });

    // Reload → confirm it came back from Postgres.
    await page.goto(`${BASE_URL}/directorio`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Buscar en el directorio…").fill(PROVIDER_NAME);
    await expect(page.locator("tr", { hasText: PROVIDER_NAME })).toBeVisible({ timeout: 15_000 });
  });
});
