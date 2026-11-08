// @vitest-environment node
/**
 * The cleanup migration that deletes `appearance.primary_color` (BE §3.12,
 * §16 D2): a no-op on a database without the key, and on one that has it the
 * key is gone while `appearance.theme` and every other setting stay as they
 * were.
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
  migrateBefore,
  migrateThrough,
  type Scratch,
} from "./redesign-test-helpers";

const TAG_SUFFIX = "_delete_primary_color_setting";

/** Tag of the cleanup migration, whatever number drizzle-kit gave it. */
function cleanupTag(): string {
  const journal = JSON.parse(readFileSync(join(__dirname, "meta/_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  const entry = journal.entries.find((e) => e.tag.endsWith(TAG_SUFFIX));
  if (!entry) throw new Error("primary color cleanup migration not in the journal");
  return entry.tag;
}

const canCreate = await canCreateDatabases();

async function setting(sql: postgres.Sql, key: string): Promise<string | null> {
  const [row] = await sql`select value from core.app_settings where key = ${key}`;
  return row ? (row.value as string) : null;
}

describe.skipIf(!canCreate)("appearance.primary_color cleanup migration (scratch databases)", () => {
  const scratches: Scratch[] = [];
  const tag = canCreate ? cleanupTag() : "";

  afterAll(async () => {
    for (const s of scratches) await dropScratch(s);
    cleanupTempDirs();
  }, 60_000);

  async function scratch(label: string) {
    const s = await createScratch(label);
    scratches.push(s);
    return s.sql;
  }

  describe("empty database", () => {
    let sql: postgres.Sql;
    let themeBefore: string | null;

    beforeAll(async () => {
      sql = await scratch("primary-empty");
      await migrateBefore(sql, tag);
      themeBefore = await setting(sql, "appearance.theme");
      await migrateThrough(sql, tag);
    }, 120_000);

    it("applies without the key and leaves appearance.theme untouched", async () => {
      expect(await setting(sql, "appearance.primary_color")).toBeNull();
      expect(await setting(sql, "appearance.theme")).toBe(themeBefore);
    });
  });

  describe("database with appearance.primary_color set", () => {
    let sql: postgres.Sql;
    let before: Map<string, string>;

    beforeAll(async () => {
      sql = await scratch("primary-set");
      await migrateBefore(sql, tag);
      await sql`insert into core.app_settings (key, value) values ('appearance.primary_color', 'blue-600')`;
      const rows = await sql`select key, value from core.app_settings where key <> 'appearance.primary_color'`;
      before = new Map(rows.map((r) => [r.key as string, r.value as string]));
      await migrateThrough(sql, tag);
    }, 120_000);

    it("deletes appearance.primary_color", async () => {
      expect(await setting(sql, "appearance.primary_color")).toBeNull();
    });

    it("keeps appearance.theme and every other setting unchanged", async () => {
      expect(before.has("appearance.theme")).toBe(true);
      const rows = await sql`select key, value from core.app_settings`;
      expect(new Map(rows.map((r) => [r.key as string, r.value as string]))).toEqual(before);
    });
  });
});
