/**
 * E2E: Calendario — subscribable ICS feed for Google Calendar (#434).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, request as playwrightRequest } from "@playwright/test";
import postgres from "postgres";
import { loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const TASK_TITLE = `Tarea calendario E2E ${RUN_ID}`;
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

/** Seeds a task managed by the admin with a commitment date (tagged E2E for global-cleanup). */
async function seedAdminTask(): Promise<void> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [admin] = await sql`select id from core.staff where lower(email) = 'paul@cincel.mx' limit 1`;
    if (!admin) throw new Error("seeded admin not found");
    const [client] = await sql`
      insert into core.contacts (type, kind, name) values ('cliente', 'particular', ${`Cliente Cal E2E ${RUN_ID}`}) returning id`;
    const [project] = await sql`
      insert into core.projects (name, client_id, status) values (${`Proyecto Cal E2E ${RUN_ID}`}, ${client.id}, 'activo') returning id`;
    await sql`
      insert into core.tasks (project_id, kind, title, created_by_id, manager_id, commitment_date)
      values (${project.id}, 'usuario', ${TASK_TITLE}, ${admin.id}, ${admin.id}, '2027-03-15')`;
  } finally {
    await sql.end();
  }
}

test.describe("Calendario — Google Calendar feed", () => {
  test("create a private ICS link, read it without a session, regenerate and disable it", async ({ page }) => {
    await seedAdminTask();
    await loginAsAdmin(page, BASE_URL);
    await page.goto(`${BASE_URL}/calendario`, { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: "Sincronizar con Google Calendar" }).click();
    await page.getByRole("button", { name: "Crear enlace" }).click();
    const urlInput = page.getByLabel("Enlace del calendario");
    await expect(urlInput).toBeVisible({ timeout: 15_000 });
    const firstUrl = await urlInput.inputValue();
    expect(firstUrl).toMatch(/\/api\/calendario\/feed\/[a-f0-9]{48}\.ics$/);

    // A fresh request context has no cookies: the token in the URL is the only credential.
    const anon = await playwrightRequest.newContext();
    const res = await anon.get(firstUrl);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/calendar");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain(`SUMMARY:${TASK_TITLE}`);
    expect(body).toContain("DTSTART;VALUE=DATE:20270315");

    // A wrong token gets the same 404 as no feed at all.
    expect((await anon.get(firstUrl.replace(/[a-f0-9]{48}\.ics$/, `${"0".repeat(48)}.ics`))).status()).toBe(404);

    // Regenerating replaces the link: the old URL stops working, the new one works.
    await page.getByRole("button", { name: "Regenerar enlace" }).click();
    await expect(urlInput).not.toHaveValue(firstUrl, { timeout: 15_000 });
    const secondUrl = await urlInput.inputValue();
    expect((await anon.get(firstUrl)).status()).toBe(404);
    expect((await anon.get(secondUrl)).status()).toBe(200);

    // Disabling kills it.
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Desactivar" }).click();
    await expect(page.getByRole("button", { name: "Crear enlace" })).toBeVisible({ timeout: 15_000 });
    expect((await anon.get(secondUrl)).status()).toBe(404);

    await anon.dispose();
  });
});
