/**
 * E2E: first-login Google setup wizard of the bootstrap admin (#671), against the fake Directory.
 *
 * Opt-in: it needs the server started with the bootstrap admin and the fake Google, e.g.
 *
 *   BOOTSTRAP_ADMIN_EMAIL=$E2E_BOOTSTRAP_ADMIN_EMAIL BOOTSTRAP_ADMIN_PASSWORD=$E2E_BOOTSTRAP_ADMIN_PASSWORD
 *   GOOGLE_FAKE=1 GOOGLE_WORKSPACE_DOMAIN=example.test GOOGLE_OAUTH_CLIENT_ID=fake GOOGLE_OAUTH_CLIENT_SECRET=fake
 *   GOOGLE_SA_CLIENT_EMAIL=directory@fake.iam.gserviceaccount.com
 *   GOOGLE_FAKE_DIRECTORY='{"groups":[{"id":"g-e2e-admins","email":"e2e-admins@example.test"}]}'
 *
 * and `npm run db:migrate` (which creates the bootstrap admin) before the run. Without E2E_BOOTSTRAP_ADMIN_EMAIL
 * and E2E_BOOTSTRAP_ADMIN_PASSWORD the wizard tests are skipped. Only touches mappings whose group starts with `e2e-`.
 */
import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";
const BOOTSTRAP_EMAIL = process.env.E2E_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
const BOOTSTRAP_PASSWORD = process.env.E2E_BOOTSTRAP_ADMIN_PASSWORD ?? "";
const ADMIN_GROUP = process.env.E2E_GOOGLE_ADMIN_GROUP ?? "e2e-admins@example.test";
const WIZARD_PATH = "/ajustes/google/primeros-pasos";
/** The stepper's active step (`aria-current="step"`). */
const currentStep = (page: Page) => page.getByRole("list", { name: "Pasos" }).locator('[aria-current="step"]');

async function resetWizard(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    await sql`delete from core.workspace_group_mappings where group_email like 'e2e-%'`;
    await sql`update core.staff set onboarding_completed_at = null where lower(email) = ${BOOTSTRAP_EMAIL}`;
  } finally {
    await sql.end();
  }
}

async function loginAsBootstrapAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "load" });
  await page.getByLabel("Correo institucional").fill(BOOTSTRAP_EMAIL);
  await page.locator('input[type="password"]').first().fill(BOOTSTRAP_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
}

test.describe("Primeros pasos — grupos de Google", () => {
  test.skip(!BOOTSTRAP_EMAIL || !BOOTSTRAP_PASSWORD, "needs E2E_BOOTSTRAP_ADMIN_EMAIL and the fake Google server env");

  test.beforeEach(resetWizard);
  test.afterAll(resetWizard);

  test("the bootstrap admin maps the admin group and finishes", async ({ page }) => {
    await loginAsBootstrapAdmin(page);
    await page.waitForURL(new RegExp(`${WIZARD_PATH}$`), { timeout: 30_000 });

    // Revisión: the required settings are set by the server env, so Next is enabled.
    await expect(currentStep(page)).toContainText("Revisión");
    await expect(page.getByText("Dominio de Workspace")).toBeVisible();
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Grupo de administradores: a group the Directory doesn't know shows its error inline.
    await expect(currentStep(page)).toContainText("Grupo de administradores");
    const groupInput = page.getByLabel("Correo del grupo");
    await groupInput.fill("e2e-nadie@example.test");
    await page.getByRole("button", { name: "Guardar grupo" }).click();
    await expect(page.getByText("El grupo no existe")).toBeVisible();
    await expect(page.getByRole("button", { name: "Siguiente" })).toBeDisabled();

    await groupInput.fill(ADMIN_GROUP);
    await page.getByRole("button", { name: "Guardar grupo" }).click();
    await expect(page.getByText("Grupo de administradores asignado")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Siguiente" }).click();

    // Más grupos (opcional): the same table as Grupos de Google lists the new mapping.
    await expect(currentStep(page)).toContainText("Más grupos (opcional)");
    await expect(page.getByRole("cell", { name: ADMIN_GROUP })).toBeVisible();
    await page.getByRole("button", { name: "Siguiente" }).click();

    await expect(currentStep(page)).toContainText("Listo");
    await expect(page.getByText("Ahora entra con Google con tu cuenta de example.test.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cerrar sesión y entrar con Google" })).toBeVisible();
    await page.getByRole("button", { name: "Cerrar sesión y entrar con Google" }).click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    // Completed: the next sign-in lands on Inicio.
    await loginAsBootstrapAdmin(page);
    await page.waitForURL(/\/inicio/, { timeout: 30_000 });
  });

  test("skipping leaves a dismissible banner while no group is mapped", async ({ page }) => {
    const sql = postgres(connectionString, { max: 1 });
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from core.workspace_group_mappings`;
    await sql.end();
    test.skip(n > 0, "other group mappings exist in this database");

    await loginAsBootstrapAdmin(page);
    await page.waitForURL(new RegExp(`${WIZARD_PATH}$`), { timeout: 30_000 });
    await page.getByRole("button", { name: "Omitir por ahora" }).click();
    await page.waitForURL(/\/inicio/, { timeout: 30_000 });

    await expect(page.getByText("Nadie puede entrar con Google todavía")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar aviso" }).click();
    await expect(page.getByText("Nadie puede entrar con Google todavía")).toBeHidden();
  });
});

test.describe("Primeros pasos — otros administradores", () => {
  test("the seeded admin never lands on the Google wizard", async ({ page }) => {
    await loginAsAdmin(page, BASE_URL);
    await expect(page).not.toHaveURL(new RegExp(WIZARD_PATH));
    await page.goto(`${BASE_URL}${WIZARD_PATH}`, { waitUntil: "domcontentloaded" });
    await expect(page).not.toHaveURL(new RegExp(`${WIZARD_PATH}$`));
  });
});
