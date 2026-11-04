/**
 * E2E: Tablero columns fit the viewport once custom statuses are added —
 * five columns fit at 1536px, more scroll inside the board, never the page.
 *
 * IMPORTANT: Run only against an ephemeral or local environment (never shared staging).
 */
import { test, expect, type Page } from "@playwright/test";
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

async function boardMetrics(page: Page) {
  return page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('[data-testid="tablero-board"]');
    if (!board) throw new Error("board not found");
    return {
      boardScrolls: board.scrollWidth > board.clientWidth + 1,
      pageScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      columns: board.querySelectorAll(':scope > [role="group"]').length,
    };
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

  test("five columns fit at 1536px and more scroll inside the board", async ({ page }) => {
    // One custom status → five columns, no horizontal scroll anywhere.
    await addStatuses(1, 0);
    await page.goto(`${BASE_URL}/tablero`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("group", { name: `${STATUS_PREFIX} 1`, exact: true })).toBeVisible({ timeout: 30_000 });
    expect(await boardMetrics(page)).toEqual({ boardScrolls: false, pageScrolls: false, columns: 5 });

    // Three more → eight columns; the board scrolls, the page still does not.
    await addStatuses(3, 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("group", { name: `${STATUS_PREFIX} 4`, exact: true })).toBeAttached({ timeout: 30_000 });
    expect(await boardMetrics(page)).toEqual({ boardScrolls: true, pageScrolls: false, columns: 8 });
  });
});
