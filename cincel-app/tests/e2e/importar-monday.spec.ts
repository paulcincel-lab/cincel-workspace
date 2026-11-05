/**
 * E2E: Configuración → Importar de monday (#672), against the fake monday API (the CLI fixture account).
 *
 * Opt-in: it needs the server started with the fake monday client and without Drive, e.g.
 *
 *   MONDAY_FAKE=1 MONDAY_IMPORT_DIR=/tmp/cincel-monday-e2e (no GOOGLE_SA_* / GOOGLE_SHARED_DRIVE_ID)
 *
 * and E2E_MONDAY_FAKE=1 for the run; without it the tests are skipped. It walks Conectar, the board gallery (#685:
 * select one board → export → open its card and map it), Equivalencias, Personas, Opciones (files off because Drive
 * isn't configured), Vista previa, Importar (the card turns into its project's link) and Deshacer, so the import it
 * creates is rolled back at the end.
 */
import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const ENABLED = process.env.E2E_MONDAY_FAKE === "1";
const WIZARD_PATH = "/configuracion/importar-monday";

const next = (page: Page) => page.getByRole("button", { name: "Siguiente" });
const currentStep = (page: Page) => page.getByRole("list", { name: "Pasos" }).locator('[aria-current="step"]');

/** A previous run that was rolled back (or left open) is set aside so the test starts at Conectar. */
async function openFreshRun(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}${WIZARD_PATH}`, { waitUntil: "load" });
  await expect(page.getByText("Importar de monday").first()).toBeVisible();
  const startOver = page.getByRole("button", { name: "Empezar una importación nueva" });
  if (await startOver.isVisible()) {
    await startOver.click();
    await expect(currentStep(page)).toContainText("Conectar monday");
  }
}

test.describe("Importar de monday", () => {
  test.skip(!ENABLED, "needs E2E_MONDAY_FAKE=1 and a server started with MONDAY_FAKE=1");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("selects one board, maps it from its card, previews, imports and rolls back", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await openFreshRun(page);

    // Conectar: any token works with the fake API.
    if (await currentStep(page).getByText("Conectar monday").isVisible()) {
      await page.locator('input[type="password"]').fill("fake-token");
      await page.getByRole("button", { name: "Probar conexión" }).click();
      await expect(page.getByText("Conectado a Acme")).toBeVisible();
      await next(page).click();
    }

    // Tableros: the full-screen gallery, nothing preselected; one click on a card selects it.
    await expect(currentStep(page)).toContainText("Tableros");
    await expect(page.getByRole("button", { name: "Cerrar" })).toBeVisible();
    for (const name of ["Proyectos", "Casas"])
      await expect(page.getByRole("checkbox", { name: `Importar ${name}` })).not.toBeChecked();
    await page.getByRole("group", { name: "Proyectos" }).getByText("Proyectos", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Importar Proyectos" })).toBeChecked();
    await expect(page.getByText("Seleccionados: 1")).toBeVisible();
    // "Importar 1 tablero" exports the picked board first.
    await page.getByRole("button", { name: "Importar 1 tablero" }).click();
    await expect(next(page)).toBeEnabled({ timeout: 60_000 });

    // Its card opens its whole mapping; the fixture board has no client, so it gets a new contact.
    const card = page.getByRole("group", { name: "Proyectos" });
    await page.getByRole("button", { name: "Abrir mapeo de Proyectos" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Qué será en Cincel")).toBeVisible();
    await sheet.getByRole("combobox", { name: "Cliente", exact: true }).click();
    await page.getByRole("option", { name: "Nuevo contacto" }).click();
    await sheet.getByPlaceholder("Nombre del cliente").fill("Cliente Proyectos");
    await expect(sheet.getByText("Sin cliente.")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(card.getByText("Sin cliente.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Exportar otra vez" })).toBeVisible();
    await next(page).click();

    // Equivalencias still lists the board as mapped from its card.
    await expect(currentStep(page)).toContainText("Equivalencias");
    await expect(page.getByPlaceholder("Nombre del cliente")).toHaveValue("Cliente Proyectos");
    await next(page).click();
    await expect(page.getByText("Faltan equivalencias")).toHaveCount(0);
    await expect(currentStep(page)).toContainText("Personas");
    await next(page).click();

    // Opciones: without Drive "Incluir archivos" is off, disabled and says why.
    await expect(currentStep(page)).toContainText("Opciones");
    const files = page.getByRole("switch", { name: "Incluir archivos" });
    await expect(files).toBeDisabled();
    await expect(files).not.toBeChecked();
    await expect(page.getByText("Drive no está configurado")).toBeVisible();
    await next(page).click();

    // Vista previa: no blocking issue (the draft no longer asks for files), so it can continue.
    await expect(currentStep(page)).toContainText("Vista previa");
    await expect(page.getByText("Corrige esto antes de importar")).toHaveCount(0);
    const toImport = page.getByRole("button", { name: "Continuar a importar" });
    await expect(toImport).toBeEnabled({ timeout: 30_000 });
    await toImport.click();

    // Importar: the board's card shows its progress, then the link to its project.
    await page.getByRole("button", { name: "Importar a Cincel" }).click();
    await expect(page.getByText("Importación terminada", { exact: true }).last()).toBeVisible({ timeout: 90_000 });
    const imported = page.getByRole("list", { name: "Tableros importados" }).getByRole("group", { name: "Proyectos" });
    await expect(imported.getByRole("link").first()).toBeVisible({ timeout: 30_000 });

    // Deshacer.
    const undo = page.getByRole("button", { name: "Deshacer importación" });
    await expect(undo).toBeEnabled({ timeout: 30_000 });
    await undo.click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Deshacer importación" }).click();
    await expect(page.getByText("Importación deshecha", { exact: true }).last()).toBeVisible({ timeout: 90_000 });
  });
});
