/**
 * E2E: Mis vacaciones (redesign FE §3.7, BE §7.8, §8.8) — a collaborator
 * requests days, an administrator approves them from "Solicitudes del
 * equipo", and the requester's balance reflects the decision.
 *
 * Both users have the redesign flag on (`/biblioteca/vacaciones` is a
 * new-only route). The requester is a seeded "Colaborador" tagged E2E with
 * its own credential and a 10-day override in `staff_profiles.vacation_days`,
 * so the balance is deterministic; global-cleanup removes it (its requests,
 * preferences and profile cascade with it).
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { randomBytes, scryptSync } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import postgres from "postgres";
import { e2eAdminEmail, loginAs, loginAsAdmin } from "./helpers/seed-auth";
import { clearAppearanceCookie, setRedesignFor } from "./helpers/redesign";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const connectionString = process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

const REQUESTER_NAME = `Solicitante E2E ${RUN_ID}`;
const REQUESTER_EMAIL = `vacaciones.e2e.${RUN_ID}@cincel.test`;
const REQUESTER_PASSWORD = `Vacaciones-E2E-${RUN_ID}`;
const ENTITLED_DAYS = 10;
const COMMENT = `Viaje familiar E2E ${RUN_ID}`;

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

/** Monday of the week that contains `iso`. */
function mondayOf(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

/**
 * A Monday–Wednesday range (3 work days) inside the current year. Prefers a
 * past week, so approving it moves the days from Pendientes to Tomados; in
 * the first days of January it uses next week instead (still one year).
 */
function requestRange(today: string): { from: string; to: string; past: boolean } {
  const year = today.slice(0, 4);
  const pastFrom = mondayOf(addDays(today, -14));
  if (pastFrom.startsWith(year)) return { from: pastFrom, to: addDays(pastFrom, 2), past: true };
  const nextFrom = mondayOf(addDays(today, 7));
  return { from: nextFrom, to: addDays(nextFrom, 2), past: false };
}

let requesterId: string;

async function seedRequester(): Promise<void> {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(REQUESTER_PASSWORD.normalize("NFKC"), salt, 64).toString("hex");
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [member] = await sql`
      insert into core.staff (name, email, role, kind, capacity, active, onboarding_completed_at)
      values (${REQUESTER_NAME}, ${REQUESTER_EMAIL}, 'Colaborador', 'empleado', 5, true, now())
      returning id`;
    requesterId = member.id as string;
    await sql`
      insert into core.staff_profiles (staff_id, vacation_days) values (${requesterId}, ${ENTITLED_DAYS})
      on conflict (staff_id) do update set vacation_days = excluded.vacation_days`;
    await sql`
      insert into core.auth_credentials (staff_id, password_hash, salt, enabled, must_change_password, password_updated_at)
      values (${requesterId}, ${hash}, ${salt}, true, false, now())`;
  } finally {
    await sql.end();
  }
  await setRedesignFor(REQUESTER_EMAIL, true);
}

async function requesterRequests(): Promise<{ status: string; days: number; from: string; to: string; decidedBy: string | null }[]> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const rows = await sql`
      select status::text as status, days, from_date::text as from, to_date::text as to, decided_by
      from core.vacation_requests where staff_id = ${requesterId}`;
    return rows.map((r) => ({
      status: r.status as string,
      days: Number(r.days),
      from: r.from as string,
      to: r.to as string,
      decidedBy: (r.decided_by as string | null) ?? null,
    }));
  } finally {
    await sql.end();
  }
}

async function adminStaffId(): Promise<string> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    const [row] = await sql`
      select id from core.staff where lower(email) = lower(${e2eAdminEmail()}) and deleted_at is null limit 1`;
    return row.id as string;
  } finally {
    await sql.end();
  }
}

async function openPage(browser: Browser, login: (page: Page) => Promise<void>): Promise<Page> {
  const context = await browser.newContext();
  await clearAppearanceCookie(context);
  const page = await context.newPage();
  await login(page);
  return page;
}

async function gotoMisVacaciones(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/biblioteca/vacaciones`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Mis vacaciones", level: 1 })).toBeVisible({ timeout: 30_000 });
}

test.describe("Mis vacaciones — request, approve, balance", () => {
  test.beforeAll(async () => {
    await seedRequester();
    await setRedesignFor(e2eAdminEmail(), true);
  });

  test.afterAll(async () => {
    await setRedesignFor(e2eAdminEmail(), null);
  });

  test("a collaborator requests days, an administrator approves them and the balance updates", async ({ browser }) => {
    test.setTimeout(120_000);
    const today = todayInOrg();
    const year = today.slice(0, 4);
    const range = requestRange(today);
    const days = 3;
    const available = ENTITLED_DAYS - days;

    // --- Requester: initial balance, then the request ---
    const requester = await openPage(browser, (page) => loginAs(page, BASE_URL, REQUESTER_EMAIL, REQUESTER_PASSWORD));
    await gotoMisVacaciones(requester);
    const balance = requester.getByRole("region", { name: `Saldo ${year}` });
    await expect(balance).toContainText("Disponibles", { timeout: 30_000 });
    await expect(balance).toContainText(`${ENTITLED_DAYS} de ${ENTITLED_DAYS}`);
    // A collaborator cannot decide requests.
    await expect(requester.getByRole("heading", { name: "Solicitudes del equipo" })).toHaveCount(0);

    await requester.getByRole("button", { name: "Nueva solicitud" }).click();
    const sheet = requester.getByRole("dialog", { name: "Nueva solicitud" });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await expect(sheet).toContainText(`Te quedan ${ENTITLED_DAYS} días disponibles.`);
    await sheet.getByLabel("Desde").fill(range.from);
    await sheet.getByLabel("Hasta").fill(range.to);
    await sheet.getByLabel("Comentario").fill(COMMENT);
    await expect(sheet).toContainText(`${days} días hábiles`);
    await sheet.getByRole("button", { name: "Enviar solicitud" }).click();
    await expect(sheet).toBeHidden({ timeout: 15_000 });

    // Pending: in the history, and the days are held out of the balance.
    const historyRow = requester.getByRole("row").filter({ hasText: COMMENT });
    await expect(historyRow).toContainText("Pendiente", { timeout: 15_000 });
    await expect(balance).toContainText(`${available} de ${ENTITLED_DAYS}`, { timeout: 15_000 });
    await expect
      .poll(async () => (await requesterRequests()).map((r) => [r.status, r.days, r.from, r.to]))
      .toEqual([["pendiente", days, range.from, range.to]]);

    // --- Administrator: approve from "Solicitudes del equipo" ---
    const admin = await openPage(browser, (page) => loginAsAdmin(page, BASE_URL));
    await gotoMisVacaciones(admin);
    await expect(admin.getByRole("heading", { name: "Solicitudes del equipo" })).toBeVisible({ timeout: 30_000 });
    const pendingRow = admin.getByRole("row").filter({ hasText: REQUESTER_NAME });
    await expect(pendingRow).toBeVisible({ timeout: 15_000 });
    await expect(pendingRow).toContainText(String(days));

    await admin.getByRole("button", { name: `Aprobar solicitud de ${REQUESTER_NAME}` }).click();
    const dialog = admin.getByRole("dialog", { name: "Aprobar solicitud" });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await dialog.getByLabel("Nota (opcional)").fill("Aprobado E2E");
    await dialog.getByRole("button", { name: "Aprobar", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(admin.getByText("Solicitud aprobada").first()).toBeVisible({ timeout: 15_000 });
    await expect(admin.getByRole("row").filter({ hasText: REQUESTER_NAME })).toHaveCount(0, { timeout: 15_000 });

    const adminId = await adminStaffId();
    await expect
      .poll(async () => (await requesterRequests()).map((r) => [r.status, r.decidedBy]))
      .toEqual([["aprobada", adminId]]);

    // --- Requester: the decision shows and the balance is updated ---
    await gotoMisVacaciones(requester);
    const balanceAfter = requester.getByRole("region", { name: `Saldo ${year}` });
    await expect(requester.getByRole("row").filter({ hasText: COMMENT })).toContainText("Aprobada", { timeout: 15_000 });
    await expect(balanceAfter).toContainText(`${available} de ${ENTITLED_DAYS}`, { timeout: 15_000 });
    if (range.past) {
      // An approved range already over counts as Tomados (BE §8.8).
      await expect(balanceAfter).toContainText(`${days} días`);
    }

    await admin.context().close();
    await requester.context().close();
  });
});
