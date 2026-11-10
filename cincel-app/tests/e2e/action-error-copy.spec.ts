/**
 * E2E: action error copy survives a production build (#931, plan §4.4).
 *
 * A production build replaces the message of an error thrown by a server
 * action with a generic sentence plus a digest, so `actionErrorText` could
 * only show the generic copy. User-facing mutations return
 * `{ ok: false, error }` instead; this spec checks, against the real server,
 * that the specific Spanish copy reaches the screen. CI runs the e2e suite on
 * `next build && next start` (playwright.config.ts), which is the case that
 * matters; under `next dev` it passes as well.
 *
 * Vacaciones: a collaborator with a pending request asks for the same dates
 * again → `OVERLAP` → "Ya tienes una solicitud en esas fechas.".
 *
 * The requester is a seeded "Colaborador" tagged E2E; global-cleanup removes
 * it (its requests and profile cascade with it).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { randomBytes, scryptSync } from "node:crypto";
import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/seed-auth";
import { BASE_URL, clearAppearanceCookie, withDb } from "./helpers/redesign";

const RUN_ID = `${Date.now()}${randomBytes(2).toString("hex")}`;
const REQUESTER_NAME = `Copia de error E2E ${RUN_ID}`;
const REQUESTER_EMAIL = `error-copy.e2e.${RUN_ID}@cincel.test`;
const REQUESTER_PASSWORD = `Error-Copy-E2E-${RUN_ID}`;

/** The copy `actionErrorText` shows for any code it does not know (and for a stripped error). */
const GENERIC_COPY = "No se pudo completar la acción. Intenta de nuevo.";
const OVERLAP_COPY = "Ya tienes una solicitud en esas fechas.";

/** Today as YYYY-MM-DD in the organization's time zone (same rule as the app). */
function todayInOrg(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Monday to Wednesday of next week: three work days, never in the past. */
function nextWeekRange(today: string): { from: string; to: string } {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const from = addDays(today, dow === 0 ? 1 : 8 - dow);
  return { from, to: addDays(from, 2) };
}

async function seedRequesterWithPendingRequest(range: { from: string; to: string }): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(REQUESTER_PASSWORD.normalize("NFKC"), salt, 64).toString("hex");
  await withDb(async (sql) => {
    const [member] = await sql`
      insert into core.staff (name, email, role, kind, capacity, active, onboarding_completed_at)
      values (${REQUESTER_NAME}, ${REQUESTER_EMAIL}, 'Colaborador', 'empleado', 5, true, now())
      returning id`;
    const staffId = member.id as string;
    await sql`
      insert into core.staff_profiles (staff_id, vacation_days) values (${staffId}, 10)
      on conflict (staff_id) do update set vacation_days = excluded.vacation_days`;
    await sql`
      insert into core.auth_credentials (staff_id, password_hash, salt, enabled, must_change_password, password_updated_at)
      values (${staffId}, ${hash}, ${salt}, true, false, now())`;
    await sql`
      insert into core.vacation_requests (staff_id, from_date, to_date, kind, comment, days)
      values (${staffId}, ${range.from}, ${range.to}, 'vacaciones', ${`Solicitud previa E2E ${RUN_ID}`}, 3)`;
  });
}

async function requestCount(): Promise<number> {
  return withDb(async (sql) => {
    const [row] = await sql`
      select count(*)::int as n from core.vacation_requests r
      join core.staff s on s.id = r.staff_id
      where lower(s.email) = lower(${REQUESTER_EMAIL})`;
    return Number(row.n);
  });
}

test.describe("Action error copy (production build)", () => {
  const range = nextWeekRange(todayInOrg());

  test.beforeAll(async () => {
    await seedRequesterWithPendingRequest(range);
  });

  test("Vacaciones: an overlapping request shows the OVERLAP copy, not the generic one", async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext();
    await clearAppearanceCookie(context);
    const page = await context.newPage();
    await loginAs(page, BASE_URL, REQUESTER_EMAIL, REQUESTER_PASSWORD);

    await page.goto(`${BASE_URL}/biblioteca/vacaciones`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Mis vacaciones", level: 1 })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Nueva solicitud" }).click();
    const sheet = page.getByRole("dialog", { name: "Nueva solicitud" });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await sheet.getByLabel("Desde").fill(range.from);
    await sheet.getByLabel("Hasta").fill(range.to);

    // The first action POST after the click is the request. It is fetched through a route so its body
    // is kept: the page refetches its data right after the failed action, and the browser may drop the
    // action's body before a waitForResponse handler gets to read it.
    let captured: (value: { status: number; body: string }) => void = () => {};
    const actionResponse = new Promise<{ status: number; body: string }>((resolve) => (captured = resolve));
    let seen = false;
    await page.route("**/*", async (route) => {
      const request = route.request();
      if (seen || request.method() !== "POST" || !request.headers()["next-action"]) return route.fallback();
      seen = true;
      const response = await route.fetch();
      const body = await response.text();
      captured({ status: response.status(), body });
      await route.fulfill({ response, body });
    });
    await sheet.getByRole("button", { name: "Enviar solicitud" }).click();

    // The action answers 200 with the code in the payload, not a 500 with only a digest.
    const response = await actionResponse;
    expect(response.status).toBe(200);
    expect(response.body).toContain("OVERLAP");

    // The specific copy shows inline; the sheet stays open and nothing new is stored.
    await expect(sheet).toContainText(OVERLAP_COPY, { timeout: 15_000 });
    await expect(sheet).not.toContainText(GENERIC_COPY);
    await expect(sheet).toBeVisible();
    expect(await requestCount()).toBe(1);

    await context.close();
  });
});
