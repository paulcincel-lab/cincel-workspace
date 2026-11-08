// @vitest-environment node
/**
 * Phase 1a DB checks (#935), against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database; it writes nothing.
 * - `countQueries` counts a known 2-query function as 2.
 * - React `cache()` on `getGeneralSettings`: two calls in one request run 1 q.
 */
import { describe, expect, it, vi } from "vitest";

import { REACT_SERVER_BUILD, withRequestCache } from "../helpers/react-request-cache";

vi.mock("react", async () => vi.importActual(REACT_SERVER_BUILD));

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("query foundation (test DB)", async () => {
  const { sql } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { countQueries } = await import("../helpers/count-queries");
  const { getGeneralSettings } = await import("@/lib/settings/general-settings-server");

  it("countQueries counts a known 2-query function as 2", async () => {
    const { result, count, statements } = await countQueries(async () => {
      const [one] = await db.execute<{ n: number }>(sql`select 1 as n`);
      const rows = await db.select({ key: schema.appSettings.key }).from(schema.appSettings).limit(1);
      return { one: Number(one.n), rows: rows.length };
    });
    expect(result.one).toBe(1);
    expect(count).toBe(2);
    expect(statements[0].sql).toMatch(/select 1/i);
    expect(statements[1].sql).toMatch(/app_settings/);
  });

  it("countQueries counts the statements inside a transaction and restores the logger", async () => {
    const { count } = await countQueries(() =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        await tx.execute(sql`select 2`);
        await tx.execute(sql`select 3`);
      }),
    );
    expect(count).toBe(3);
    const { count: after } = await countQueries(async () => undefined);
    expect(after).toBe(0);
  });

  it("getGeneralSettings called twice in one request runs 1 query", async () => {
    const { count, result } = await countQueries(() =>
      withRequestCache(async () => {
        const first = await getGeneralSettings();
        const second = await getGeneralSettings();
        return { first, second };
      }),
    );
    expect(count).toBe(1);
    expect(result.second).toEqual(result.first);
  });

  it("each request reads again (the cache is request-scoped)", async () => {
    const { count } = await countQueries(async () => {
      await withRequestCache(() => getGeneralSettings());
      await withRequestCache(() => getGeneralSettings());
    });
    expect(count).toBe(2);
  });
});
