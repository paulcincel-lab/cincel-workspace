import type { Page } from "@playwright/test";

/**
 * Test authentication helpers.
 *
 * Auth is now backed by the real Postgres database (`core.auth_credentials` +
 * `core.sessions`, scrypt, opaque cookie — see `lib/auth/session.ts` and
 * `lib/auth/auth-actions.ts`). The admin credential is created by
 * `npm run db:seed` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`), which CI runs
 * before starting the web server.
 *
 * `loginAsAdmin` therefore exercises the real end-to-end flow: the login page
 * renders, the form submits to the `loginAction` Server Action, which verifies
 * the scrypt hash and issues the session cookie.
 *
 * Business-entity data (projects, clients, tasks, …) is still the built-in mock
 * set in `localstorage` data-source mode; those specs do not need DB seeding
 * beyond the admin credential.
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "paul@cincel.mx";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "CincelAdmin2026!";

/**
 * Retained for backwards compatibility with existing specs. Auth fixtures now
 * live in the database, so there is nothing to seed per-page.
 */
export async function seedAuth(_page: Page): Promise<void> {
  void _page;
}

/** Logs in as the seeded admin user. */
export async function loginAsAdmin(page: Page, baseUrl: string): Promise<void> {
  // "load" (not "domcontentloaded") so bundles are downloaded and React has
  // hydrated before we fill the controlled inputs.
  await page.goto(`${baseUrl}/login`, { waitUntil: "load" });
  await page.getByLabel("Correo institucional").fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(
    /\/dashboard|\/clientes|\/proyectos|\/tareas|\/equipo|\/change-password/,
    { timeout: 20_000 }
  );
}
