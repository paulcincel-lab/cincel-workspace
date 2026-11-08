/**
 * E2E: the client portal project page in three presentation styles (redesign FE §3.11). A portal client picks
 * Visual, Esencial or Analítico with the top-bar EstiloSwitch; the choice is stored in the
 * `cincel-portal-style` cookie and survives a reload.
 *
 * Seeds a client, a project, an active portal user with access and a portal session straight in Postgres, and
 * lets clients pick a style (Visual by default) for the duration of the spec (restored afterwards).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { createHash, randomBytes } from "node:crypto";

import { test, expect } from "@playwright/test";
import postgres from "postgres";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const PROJECT_NAME = `Proyecto portal E2E ${RUN_ID}`;
const CLIENT_NAME = `Cliente portal E2E ${RUN_ID}`;
const PORTAL_EMAIL = `portal-e2e-${RUN_ID}@example.com`;
const TOKEN = randomBytes(32).toString("hex");

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

let projectId = "";
let previousAppearance: string | null = null;

async function seed(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [staff] = await sql`select id from core.staff where deleted_at is null order by created_at limit 1`;
    const [client] = await sql`
      insert into core.contacts (type, kind, name)
      values ('cliente', 'particular', ${CLIENT_NAME}) returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, status, progress)
      values (${PROJECT_NAME}, ${client.id}, 'activo', 40) returning id`;
    projectId = project.id;
    const [user] = await sql`
      insert into core.portal_users (email, name, contact_id, status, invited_by_staff_id, activated_at)
      values (${PORTAL_EMAIL}, ${`Cliente E2E ${RUN_ID}`}, ${client.id}, 'active', ${staff.id}, now()) returning id`;
    await sql`
      insert into core.project_portal_access (project_id, portal_user_id, granted_by_staff_id)
      values (${project.id}, ${user.id}, ${staff.id})`;
    await sql`
      insert into core.portal_sessions (token_hash, portal_user_id, expires_at)
      values (${createHash("sha256").update(TOKEN).digest("hex")}, ${user.id}, now() + interval '1 day')`;

    const [setting] = await sql`select value from core.app_settings where key = 'appearance.theme'`;
    previousAppearance = setting ? (setting.value as string) : null;
    if (setting) {
      const stored = JSON.parse(setting.value as string) as { version: number; data: Record<string, unknown> };
      stored.data.allowUserOverride = true;
      stored.data.styleDefault = "visual";
      await sql`update core.app_settings set value = ${JSON.stringify(stored)} where key = 'appearance.theme'`;
    }
  } finally {
    await sql.end();
  }
}

async function cleanup(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    if (previousAppearance !== null) {
      await sql`update core.app_settings set value = ${previousAppearance} where key = 'appearance.theme'`;
    }
    // Sessions and access rows cascade with the portal user.
    await sql`delete from core.portal_users where email = ${PORTAL_EMAIL}`;
    await sql`delete from core.projects where name = ${PROJECT_NAME}`;
    await sql`delete from core.contacts where name = ${CLIENT_NAME}`;
  } finally {
    await sql.end();
  }
}

test.describe("Portal · proyecto en tres estilos", () => {
  test.beforeAll(seed);
  test.afterAll(cleanup);

  test.beforeEach(async ({ context }) => {
    const { hostname } = new URL(BASE_URL);
    await context.addCookies([
      { name: "cincel_portal_session", value: TOKEN, domain: hostname, path: "/", httpOnly: true, sameSite: "Lax" },
    ]);
  });

  test("switches style with the keyboard and keeps it after a reload", async ({ page, context }) => {
    await page.goto(`${BASE_URL}/portal/proyectos/${projectId}`, { waitUntil: "load" });
    await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });

    const group = page.getByRole("banner").getByRole("radiogroup");
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio", { name: "Visual" })).toHaveAttribute("aria-checked", "true");

    // Arrow keys move and select inside the radiogroup.
    await group.getByRole("radio", { name: "Visual" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "Esencial" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "Analítico" })).toHaveAttribute("aria-checked", "true");

    await expect
      .poll(async () => (await context.cookies()).find((c) => c.name === "cincel-portal-style")?.value)
      .toBe("analitico");

    await page.reload({ waitUntil: "load" });
    await expect(
      page.getByRole("banner").getByRole("radiogroup").getByRole("radio", { name: "Analítico" }),
    ).toHaveAttribute("aria-checked", "true");

    // Same data in every style: the overall progress row is there.
    await expect(page.getByText("Avance general")).toBeVisible();
  });

  test("an invalid style cookie falls back to the organization default", async ({ page, context }) => {
    const { hostname } = new URL(BASE_URL);
    await context.addCookies([{ name: "cincel-portal-style", value: "oscuro", domain: hostname, path: "/" }]);

    await page.goto(`${BASE_URL}/portal/proyectos/${projectId}`, { waitUntil: "load" });
    await expect(
      page.getByRole("banner").getByRole("radiogroup").getByRole("radio", { name: "Visual" }),
    ).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  });

  test("fits a 390 px screen without horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const style of ["visual", "esencial", "analitico"]) {
      await page.context().addCookies([
        { name: "cincel-portal-style", value: style, domain: new URL(BASE_URL).hostname, path: "/" },
      ]);
      await page.goto(`${BASE_URL}/portal/proyectos/${projectId}`, { waitUntil: "load" });
      await expect(page.getByRole("heading", { level: 1, name: PROJECT_NAME })).toBeVisible({ timeout: 30_000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, style).toBeLessThanOrEqual(0);
    }
  });
});
