/**
 * E2E: the Tablero view of `/tareas?vista=tablero` (redesign FE §3.4) keeps
 * custom status columns on the board (empty ones collapse) and the page never
 * scrolls sideways.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect } from "@playwright/test";
import postgres from "postgres";
import { seedAuth, loginAsAdmin } from "./helpers/seed-auth";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = Date.now();
const STATUS_PREFIX = `Columna E2E ${RUN_ID}`;

const connectionString =
  process.env.DATABASE_URL ?? "postgres://cincel:cincel@localhost:5432/cincel";

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(connectionString, { max: 1 });
  try {
    return await fn(sql);
  } finally {
    await sql.end();
  }
}

/** Soft-deletes every other custom status so the board starts from the four built-in columns. */
async function hideOtherStatuses(): Promise<string[]> {
  return withSql(async (sql) => {
    const rows = await sql`
      update core.task_statuses set deleted_at = now()
      where deleted_at is null and name not like ${`${STATUS_PREFIX}%`} returning id`;
    return rows.map((r) => r.id as string);
  });
}

async function addStatuses(count: number, offset: number): Promise<void> {
  await withSql(async (sql) => {
    for (let i = 0; i < count; i++) {
      await sql`
        insert into core.task_statuses (name, sort_order)
        values (${`${STATUS_PREFIX} ${offset + i + 1}`}, ${900 + offset + i})`;
    }
  });
}

test.describe("Columnas del Tablero", () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  let hiddenIds: string[] = [];

  test.beforeAll(async () => {
    hiddenIds = await hideOtherStatuses();
  });

  test.afterAll(async () => {
    await withSql(async (sql) => {
      await sql`delete from core.task_statuses where name like ${`${STATUS_PREFIX}%`}`;
      if (hiddenIds.length) await sql`update core.task_statuses set deleted_at = null where id in ${sql(hiddenIds)}`;
    });
  });

  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
    await loginAsAdmin(page, BASE_URL);
  });

  test("custom status columns render on /tareas?vista=tablero and the page never scrolls sideways", async ({ page }) => {
    // The legacy route redirects to the Tablero view (FE §2.2).
    await page.goto(`${BASE_URL}/tablero`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tareas\?(.*&)?vista=tablero/, { timeout: 30_000 });

    await addStatuses(1, 10);
    await page.goto(`${BASE_URL}/tareas?vista=tablero`, { waitUntil: "domcontentloaded" });
    // Empty columns collapse to a vertical strip but stay on the board, named by their status.
    await expect(page.getByRole("group", { name: new RegExp(`^${STATUS_PREFIX} 11`) })).toBeAttached({
      timeout: 30_000,
    });
    for (const base of ["Pendiente", "En proceso", "Completado", "Bloqueado"]) {
      await expect(page.getByRole("group", { name: new RegExp(`^${base}`) }).first()).toBeAttached();
    }
    const pageScrolls = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(pageScrolls).toBe(false);
  });
});
