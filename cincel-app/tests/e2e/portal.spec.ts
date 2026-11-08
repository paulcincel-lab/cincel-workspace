/**
 * E2E: the client portal (redesign FE §3.11, #506): a portal client without a session is sent to the
 * sign-in page, asks for a link ("Revisa tu correo"), opens the link page and "Entrar al portal" lands on
 * the project page.
 *
 * Seeds a client, a project and an active portal user with access straight in Postgres. The raw token of
 * the emailed link never leaves the server, so the spec stores its own single-use link (sha256 of the
 * token, like `issuePortalLoginLink`) and opens `/portal/acceder?token=…` the way the email would.
 *
 * The staff side (Query Migration 5d, #962): inviting a portal client from the project's Clientes tab updates the
 * list and the tab count with no route refresh (no `_rsc` request).
 *
 * Query Migration Phase 11 (#945): switching tabs stays on the client (no `_rsc` request; a tab already in
 * the query cache needs no request at all), **Salir** clears the cache, and with the organization style fixed
 * the portal shows no style switch and ignores `?estilo=`.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { createHash, randomBytes } from "node:crypto";

import { test, expect, type Page } from "@playwright/test";
import postgres from "postgres";

import { loginAsAdmin, seedAuth } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? "3000"}`;
const RUN_ID = Date.now();
const PROJECT_NAME = `Proyecto portal E2E ${RUN_ID}`;
const CLIENT_NAME = `Cliente portal E2E ${RUN_ID}`;
const PORTAL_EMAIL = `portal-e2e-${RUN_ID}@example.com`;
const TOKEN = randomBytes(32).toString("hex");

const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

let projectId = "";

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

async function seed(): Promise<void> {
  await withSql(async (sql) => {
    const [staff] = await sql`select id from core.staff where deleted_at is null order by created_at limit 1`;
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${CLIENT_NAME}) returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, status, progress)
      values (${PROJECT_NAME}, ${client.id}, 'activo', 40) returning id`;
    projectId = project.id as string;
    const [user] = await sql`
      insert into core.portal_users (email, name, contact_id, status, invited_by_staff_id, activated_at)
      values (${PORTAL_EMAIL}, ${`Cliente E2E ${RUN_ID}`}, ${client.id}, 'active', ${staff.id}, now()) returning id`;
    await sql`
      insert into core.project_portal_access (project_id, portal_user_id, granted_by_staff_id)
      values (${project.id}, ${user.id}, ${staff.id})`;
  });
}

/** A valid single-use sign-in link for the portal user that returns to the project page. */
async function storeLoginLink(): Promise<void> {
  await withSql(async (sql) => {
    const tokenHash = createHash("sha256").update(TOKEN).digest("hex");
    // One link per token hash: a later sign-in replaces the used one.
    await sql`delete from core.portal_login_links where token_hash = ${tokenHash}`;
    await sql`
      insert into core.portal_login_links (portal_user_id, token_hash, return_to, expires_at)
      select id, ${tokenHash}, ${`/portal/proyectos/${projectId}`}, now() + interval '15 minutes'
      from core.portal_users where email = ${PORTAL_EMAIL}`;
  });
}

/** Signs the seeded client in through a fresh single-use link that returns to the project page. */
async function signIn(page: Page): Promise<void> {
  await storeLoginLink();
  await page.goto(`${BASE_URL}/portal/acceder?token=${TOKEN}`, { waitUntil: "load" });
  await page.getByRole("button", { name: "Entrar al portal" }).click();
  await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
}

/** `appearance.theme` before a test changed it, so it can be put back. */
let savedOrgAppearance: string | null | undefined;

/** Sets `allowUserOverride` on the stored org appearance (`{ version: 1, data }` in `app_settings`). */
async function setAllowUserOverride(allow: boolean): Promise<void> {
  await withSql(async (sql) => {
    const [row] = await sql`select value from core.app_settings where key = 'appearance.theme'`;
    if (savedOrgAppearance === undefined) savedOrgAppearance = (row?.value as string | undefined) ?? null;
    const envelope = row ? JSON.parse(row.value as string) : { version: 1, data: {} };
    envelope.data = { ...envelope.data, allowUserOverride: allow, styleDefault: envelope.data?.styleDefault ?? "visual" };
    const value = JSON.stringify(envelope);
    await sql`
      insert into core.app_settings (key, value) values ('appearance.theme', ${value})
      on conflict (key) do update set value = excluded.value`;
  });
}

async function restoreOrgAppearance(): Promise<void> {
  if (savedOrgAppearance === undefined) return;
  const saved = savedOrgAppearance;
  savedOrgAppearance = undefined;
  await withSql(async (sql) => {
    if (saved === null) await sql`delete from core.app_settings where key = 'appearance.theme'`;
    else await sql`update core.app_settings set value = ${saved} where key = 'appearance.theme'`;
  });
}

async function cleanup(): Promise<void> {
  await withSql(async (sql) => {
    // Links, sessions and access rows cascade with the portal user.
    await sql`delete from core.portal_users where email = ${PORTAL_EMAIL}`;
    await sql`delete from core.projects where name = ${PROJECT_NAME}`;
    await sql`delete from core.contacts where name = ${CLIENT_NAME}`;
  });
}

test.describe("Portal — acceso y proyecto", () => {
  test.beforeAll(seed);
  test.afterAll(cleanup);

  test("a client signs in with the emailed link and lands on the project page", async ({ page, context }) => {
    // No session: the project page sends the client to the sign-in page.
    await page.goto(`${BASE_URL}/portal/proyectos/${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/portal\/login/, { timeout: 30_000 });

    await page.getByLabel("Correo").fill(PORTAL_EMAIL);
    await page.getByRole("button", { name: /^Enviar enlace/ }).click();
    await expect(page.getByText("Revisa tu correo")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(PORTAL_EMAIL)).toBeVisible();

    // The link from the email: the page only signs in on "Entrar al portal".
    await storeLoginLink();
    await page.goto(`${BASE_URL}/portal/acceder?token=${TOKEN}`, { waitUntil: "load" });
    await page.getByRole("button", { name: "Entrar al portal" }).click();

    await expect(page).toHaveURL(new RegExp(`/portal/proyectos/${projectId}`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Avance general")).toBeVisible();
    expect((await context.cookies()).some((c) => c.name === "cincel_portal_session")).toBe(true);

    // The link is single use: opening it again sends the client back to the sign-in page.
    await context.clearCookies();
    await page.goto(`${BASE_URL}/portal/acceder?token=${TOKEN}`, { waitUntil: "load" });
    await page.getByRole("button", { name: "Entrar al portal" }).click();
    await expect(page).toHaveURL(/\/portal\/login\?error=link/, { timeout: 30_000 });
  });

  test("switching tabs makes no RSC request and a cached tab no request at all", async ({ page }) => {
    await signIn(page);

    const rsc: string[] = [];
    const actions: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.searchParams.has("_rsc") || request.headers()["rsc"] === "1") rsc.push(request.url());
      if (request.method() === "POST" && request.headers()["next-action"]) actions.push(request.url());
    });

    const tabs = page.getByRole("navigation", { name: "Secciones del proyecto" });
    await tabs.getByRole("tab", { name: "Cronograma" }).click();
    await expect(page).toHaveURL(/tab=cronograma/);
    await expect(page.getByText("El cronograma aún no está disponible.")).toBeVisible({ timeout: 15_000 });

    await tabs.getByRole("tab", { name: "Archivos" }).click();
    await expect(page).toHaveURL(/tab=archivos/);
    await expect(page.getByText("Los archivos estarán disponibles pronto.")).toBeVisible({ timeout: 15_000 });

    const actionsBeforeResumen = actions.length;
    await tabs.getByRole("tab", { name: "Resumen" }).click();
    await expect(page.getByText("Avance general")).toBeVisible();

    expect(rsc).toEqual([]);
    // Resumen was seeded by the first load (portal.project(id, 'resumen'), 60 s stale): no request.
    expect(actions.length).toBe(actionsBeforeResumen);

    // Back / forward follow the URL without a server round trip either.
    await page.goBack();
    await expect(page).toHaveURL(/tab=archivos/);
    expect(rsc).toEqual([]);
  });

  test("Salir signs the client out and the next visit starts without cached data", async ({ page }) => {
    await signIn(page);

    await page.getByRole("link", { name: "Salir" }).click();
    await expect(page).toHaveURL(/\/portal\/login/, { timeout: 30_000 });

    await page.goto(`${BASE_URL}/portal/proyectos/${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/portal\/login/, { timeout: 30_000 });
    await expect(page.getByText(PROJECT_NAME)).toHaveCount(0);
  });

  test.describe("organization style fixed", () => {
    test.afterEach(restoreOrgAppearance);

    test("no style switch, and ?estilo= keeps the org style", async ({ page }) => {
      await setAllowUserOverride(false);
      await signIn(page);

      await expect(page.getByRole("radiogroup", { name: /estilo/i })).toHaveCount(0);
      const orgStyle = await page.locator("main [data-style]").first().getAttribute("data-style");

      await page.goto(`${BASE_URL}/portal/proyectos/${projectId}?estilo=esencial`, { waitUntil: "load" });
      await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("radiogroup", { name: /estilo/i })).toHaveCount(0);
      expect(await page.locator("main [data-style]").first().getAttribute("data-style")).toBe(orgStyle);
    });
  });
});

// ── Staff side: Clientes tab (Query Migration 5d, #962) ──────────────────────

const INVITE_PROJECT = `Proyecto clientes E2E ${RUN_ID}`;
const INVITE_CLIENT = `Cliente invitado E2E ${RUN_ID}`;
const INVITE_EMAIL = `invitado-e2e-${RUN_ID}@example.com`;
let inviteProjectId = "";

test.describe("Proyecto · Clientes (staff)", () => {
  test.beforeAll(async () => {
    await withSql(async (sql) => {
      const [client] = await sql`
        insert into core.contacts (type, kind, name, email)
        values ('cliente', 'particular', ${INVITE_CLIENT}, ${INVITE_EMAIL}) returning id`;
      const [project] = await sql`
        insert into core.projects (name, client_id, status)
        values (${INVITE_PROJECT}, ${client.id}, 'activo') returning id`;
      inviteProjectId = project.id as string;
    });
  });

  test.afterAll(async () => {
    await withSql(async (sql) => {
      await sql`delete from core.portal_users where email = ${INVITE_EMAIL}`;
      await sql`delete from core.projects where name = ${INVITE_PROJECT}`;
      await sql`delete from core.contacts where name = ${INVITE_CLIENT}`;
    });
  });

  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("inviting a client updates the list and the tab count without a refresh", async ({ page }) => {
    await page.goto(`${BASE_URL}/proyectos/${inviteProjectId}/clientes`, { waitUntil: "domcontentloaded" });
    const tabs = page.getByRole("navigation", { name: "Secciones del proyecto" });
    await expect(tabs.getByRole("tab", { name: /^Clientes\s*0$/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Aún no hay clientes invitados a este proyecto.")).toBeVisible();

    // From here on, any RSC request would mean the route refreshed.
    const rscRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("_rsc=") || request.headers()["rsc"] === "1") rscRequests.push(url);
    });

    await page.getByRole("button", { name: "Invitar cliente" }).click();
    await page.getByRole("button", { name: "Contacto" }).click();
    await page.getByRole("option", { name: new RegExp(INVITE_CLIENT) }).click();
    await expect(page.getByLabel("Correo")).toHaveValue(INVITE_EMAIL);
    await page.getByRole("button", { name: "Enviar invitación" }).click();
    // The email may not go out locally; access is granted either way.
    await expect(page.getByText(/Invitación enviada|Se dio acceso pero el correo no salió/)).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByRole("cell", { name: INVITE_EMAIL })).toBeVisible({ timeout: 15_000 });
    await expect(tabs.getByRole("tab", { name: /^Clientes\s*1$/ })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/proyectos/${inviteProjectId}/clientes$`));
    expect(rscRequests).toEqual([]);
  });
});
