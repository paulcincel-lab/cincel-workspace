// @vitest-environment node
/**
 * The partial index behind Inicio's status feeds (issue 922):
 * `listStatusEvents` and `listTaskTrendSource` read every `cambio` of one
 * field since a date across all rows of an entity, which the
 * (entity, entity_id, event_at) index cannot serve as a range.
 *
 * Runs only when TEST_DATABASE_URL is set and its role may create databases.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  canCreateDatabases,
  cleanupTempDirs,
  createScratch,
  dropScratch,
  migrateThrough,
  type Scratch,
} from "./redesign-test-helpers";

const TAG_SUFFIX = "_history_change_feed_index";
const INDEX = "idx_history_events_change_feed";

function migrationTag(): string {
  const journal = JSON.parse(readFileSync(join(__dirname, "meta/_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  const entry = journal.entries.find((e) => e.tag.endsWith(TAG_SUFFIX));
  if (!entry) throw new Error("history change feed index migration not in the journal");
  return entry.tag;
}

const canCreate = await canCreateDatabases();

describe.skipIf(!canCreate)("history change feed index (scratch database)", () => {
  let scratch: Scratch;
  let sql: postgres.Sql;

  beforeAll(async () => {
    scratch = await createScratch("change-feed");
    sql = scratch.sql;
    await migrateThrough(sql, migrationTag());
  }, 120_000);

  afterAll(async () => {
    await dropScratch(scratch);
    cleanupTempDirs();
  }, 60_000);

  it("exists on (entity, field, event_at) for cambio rows only", async () => {
    const [row] = await sql`
      select indexdef from pg_indexes where schemaname = 'core' and indexname = ${INDEX}
    `;
    expect(row).toBeTruthy();
    const def = String(row.indexdef);
    expect(def).toContain("(entity, field, event_at)");
    expect(def).toMatch(/WHERE \(kind = 'cambio'/);
  });

  it("serves the Inicio status feed query", async () => {
    await sql.begin(async (tx) => {
      await tx`set local enable_seqscan = off`;
      const plan = await tx`
        explain select entity_id, event_at, before_value, after_value
        from core.history_events
        where entity = 'task' and kind = 'cambio' and field = 'status' and event_at >= now() - interval '8 days'
        order by event_at
      `;
      const text = plan.map((r) => String(r["QUERY PLAN"])).join("\n");
      expect(text).toContain(INDEX);
    });
  });
});
