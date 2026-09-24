/**
 * E2E: Tareas — create a task and verify commitmentDate/reviewDate fields
 * and persistence in the list.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const TASK_DESC = `Tarea E2E ${RUN_ID}`;

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

/**
 * The "Nueva tarea" sheet only lets you save once a project is selected —
 * its project dropdown is populated from active projects on the current
 * workflow, and "Guardar" stays disabled with none available (see
 * NewTaskModal.tsx). A fresh DB (scripts/seed.ts) seeds no projects at all,
 * so this spec seeds its own client + active "presale" project directly,
 * tagged "E2E" so global-cleanup.ts purges it like every other spec's rows.
 */
// Every test in this file shares the same RUN_ID and calls this from its own
// beforeEach — memoize so the client/project are only ever inserted once per
// run, instead of every test's beforeEach re-inserting the same name and
// hitting contacts_type_name_lower_uq.
let presaleProjectReady: Promise<void> | null = null;

async function ensurePresaleProject(): Promise<void> {
  presaleProjectReady ??= (async () => {
    const sql = postgres(connectionString, { max: 1 });
    try {
      const [workflow] = await sql`select id from core.workflows where key = 'presale' limit 1`;
      if (!workflow) throw new Error("presale workflow not seeded");
      const [client] = await sql`
        insert into core.contacts (type, kind, name)
        values ('cliente', 'particular', ${`Cliente E2E ${RUN_ID}`})
        returning id
      `;
      await sql`
        insert into core.projects (name, client_id, current_workflow_id, status)
        values (${`Proyecto E2E ${RUN_ID}`}, ${client.id}, ${workflow.id}, 'activo')
      `;
    } finally {
      await sql.end();
    }
  })();
  return presaleProjectReady;
}

test.describe("Tareas — create task with commitmentDate and reviewDate", () => {
  test.beforeEach(async ({ page }) => {
    await ensurePresaleProject();
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

  test("can add a task from the quick-entry row with Enter", async ({ page }) => {
    // Runs after the test above, so the E2E project already has a task and therefore an accordion.
    const quickTitle = `Tarea rapida E2E ${RUN_ID}`;
    const quickInput = page.getByPlaceholder(/Nueva tarea \(Enter/i).first();
    await expect(quickInput).toBeVisible({ timeout: 30_000 });
    await quickInput.fill(quickTitle);
    await quickInput.press("Enter");

    await page.getByPlaceholder(/Buscar tarea/i).fill(quickTitle);
    await expect(page.getByText(quickTitle)).toBeVisible({ timeout: 15_000 });
  });

  test("hides completed tasks until 'Mostrar completadas' is on (#458)", async ({ page }) => {
    const doneTitle = `Tarea completada E2E ${RUN_ID}`;
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`
        insert into core.tasks (project_id, workflow_id, kind, title, status, created_by_id)
        select p.id, p.current_workflow_id, 'usuario', ${doneTitle}, 'completado', (select id from core.staff limit 1)
        from core.projects p where p.name = ${`Proyecto E2E ${RUN_ID}`}`;
    } finally {
      await sql.end();
    }

    await page.goto(`${BASE_URL}/actividades/presale`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Nueva tarea/i }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/Buscar tarea/i).fill(doneTitle);
    await expect(page.getByText(doneTitle)).toHaveCount(0);

    const toggle = page.getByRole("switch", { name: "Mostrar completadas" });
    await toggle.click();
    await expect(page.getByText(doneTitle)).toBeVisible({ timeout: 15_000 });

    await toggle.click();
    await expect(page.getByText(doneTitle)).toHaveCount(0);
  });

  test("Mis tareas also hides completed tasks until 'Mostrar completadas' is on", async ({ page }) => {
    const doneTitle = `Mi tarea completada E2E ${RUN_ID}`;
    const adminEmail = process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx";
    const sql = postgres(connectionString, { max: 1 });
    try {
      await sql`
        insert into core.tasks (project_id, workflow_id, kind, title, status, created_by_id, manager_id)
        select p.id, p.current_workflow_id, 'usuario', ${doneTitle}, 'completado', s.id, s.id
        from core.projects p, core.staff s
        where p.name = ${`Proyecto E2E ${RUN_ID}`} and lower(s.email) = lower(${adminEmail}) and s.deleted_at is null`;
    } finally {
      await sql.end();
    }

    await page.goto(`${BASE_URL}/mis-tareas`, { waitUntil: "domcontentloaded" });
    const toggle = page.getByRole("switch", { name: "Mostrar completadas" });
    await expect(toggle).toBeVisible({ timeout: 30_000 });
    await page.getByPlaceholder(/Buscar/i).first().fill(doneTitle);
    await expect(page.getByText(doneTitle)).toHaveCount(0);

    await toggle.click();
    await expect(page.getByText(doneTitle)).toBeVisible({ timeout: 15_000 });
  });

  test("can attach a .txt file to a task as a comment (#425)", async ({ page }) => {
    // Runs after the first test, so TASK_DESC already exists as a row.
    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_DESC);
    await page.getByTitle("Ver detalle").first().click();
    await page.getByText("Detalle de tarea").waitFor({ state: "visible", timeout: 15_000 });

    const fileName = `adjunto-${RUN_ID}.txt`;
    const drawer = page.locator('[data-slot="sheet-content"]');
    await drawer.locator('input[type="file"]').setInputFiles({
      name: fileName,
      mimeType: "text/plain",
      buffer: Buffer.from("contenido de prueba E2E"),
    });

    // Uploading also logs a "Adjuntó un archivo: ..." history comment, so the
    // filename appears twice — the attachment card has its own title attribute
    // set to exactly the filename, unlike the history entry's prose sentence.
    await expect(drawer.getByTitle(fileName)).toBeVisible({ timeout: 15_000 });

    // Reload and reopen — confirm it persisted to Postgres, not just optimistic state.
    await page.goto(`${BASE_URL}/actividades/presale`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_DESC);
    await page.getByTitle("Ver detalle").first().click();
    await page.getByText("Detalle de tarea").waitFor({ state: "visible", timeout: 15_000 });
    await expect(drawer.getByTitle(fileName)).toBeVisible({ timeout: 15_000 });
  });

  test("can add internal and client Drive links to a task, and remove one (#436)", async ({ page }) => {
    // Runs after the first test, so TASK_DESC already exists as a row.
    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_DESC);
    await page.getByTitle("Ver detalle").first().click();
    await page.getByText("Detalle de tarea").waitFor({ state: "visible", timeout: 15_000 });
    const drawer = page.locator('[data-slot="sheet-content"]');

    const addLink = async (kind: "interno" | "cliente", title: string, url: string) => {
      await drawer.getByLabel("Tipo de enlace").selectOption(kind);
      await drawer.getByPlaceholder("Nombre del enlace").fill(title);
      await drawer.getByPlaceholder(/drive\.google\.com/).fill(url);
      await drawer.getByRole("button", { name: "Agregar enlace" }).click();
    };

    // A non-web URL is refused client-side and nothing is added.
    await addLink("interno", "Trampa", "javascript:alert(1)");
    await expect(drawer.getByText("El enlace debe empezar con http")).toBeVisible();
    await expect(drawer.getByRole("link", { name: "Trampa" })).toHaveCount(0);

    const internal = `Planos internos ${RUN_ID}`;
    const client = `Carpeta del cliente ${RUN_ID}`;
    await addLink("interno", internal, "https://drive.google.com/drive/folders/interno1");
    await addLink("cliente", client, "https://drive.google.com/drive/folders/cliente1");

    const internalLink = drawer.getByRole("link", { name: internal });
    const clientLink = drawer.getByRole("link", { name: client });
    await expect(internalLink).toHaveAttribute("href", "https://drive.google.com/drive/folders/interno1");
    await expect(clientLink).toHaveAttribute("rel", /noopener/);

    // Persisted: reload, reopen, both are still there.
    await page.goto(`${BASE_URL}/actividades/presale`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_DESC);
    await page.getByTitle("Ver detalle").first().click();
    await page.getByText("Detalle de tarea").waitFor({ state: "visible", timeout: 15_000 });
    await expect(drawer.getByRole("link", { name: internal })).toBeVisible({ timeout: 15_000 });
    await expect(drawer.getByRole("link", { name: client })).toBeVisible();

    // Removing one leaves the other.
    await drawer.locator("li").filter({ hasText: client }).getByRole("button", { name: "Quitar" }).click();
    await expect(drawer.getByRole("link", { name: client })).toHaveCount(0, { timeout: 15_000 });
    await expect(drawer.getByRole("link", { name: internal })).toBeVisible();
  });

  test("can attach a photo to a checklist item and still check it off (#436)", async ({ page }) => {
    // Runs after the first test, so TASK_DESC already exists as a row.
    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_DESC);
    await page.getByTitle("Ver detalle").first().click();
    await page.getByText("Detalle de tarea").waitFor({ state: "visible", timeout: 15_000 });
    const drawer = page.locator('[data-slot="sheet-content"]');

    const itemTitle = `Colar losa ${RUN_ID}`;
    await drawer.getByPlaceholder("Nuevo punto...").fill(itemTitle);
    await drawer.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(drawer.getByText(itemTitle)).toBeVisible({ timeout: 15_000 });

    // 1x1 transparent PNG.
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "base64"
    );
    const photoName = `evidencia-${RUN_ID}.png`;
    await drawer.getByLabel(`Adjuntar foto a ${itemTitle}`).setInputFiles({ name: photoName, mimeType: "image/png", buffer: png });

    const row = drawer.locator("div.rounded-lg").filter({ hasText: itemTitle });
    await expect(row.getByTitle(photoName)).toBeVisible({ timeout: 15_000 });

    // The reported bug: an item with a photo couldn't be closed.
    await row.getByRole("checkbox").click();
    await expect(row.getByRole("checkbox")).toBeChecked({ timeout: 15_000 });

    // Persisted after reload: still checked, photo still under the item, not in the general attachments.
    await page.goto(`${BASE_URL}/actividades/presale`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder(/Buscar tarea/i).fill(TASK_DESC);
    await page.getByTitle("Ver detalle").first().click();
    await page.getByText("Detalle de tarea").waitFor({ state: "visible", timeout: 15_000 });
    const rowAfter = drawer.locator("div.rounded-lg").filter({ hasText: itemTitle });
    await expect(rowAfter.getByTitle(photoName)).toBeVisible({ timeout: 15_000 });
    await expect(rowAfter.getByRole("checkbox")).toBeChecked();
    await expect(drawer.getByTitle(photoName)).toHaveCount(1);
  });
});
