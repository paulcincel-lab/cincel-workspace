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
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { createHash, randomBytes } from "node:crypto";

import { test, expect } from "@playwright/test";
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
    await sql`
      insert into core.portal_login_links (portal_user_id, token_hash, return_to, expires_at)
      select id, ${tokenHash}, ${`/portal/proyectos/${projectId}`}, now() + interval '15 minutes'
      from core.portal_users where email = ${PORTAL_EMAIL}`;
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
