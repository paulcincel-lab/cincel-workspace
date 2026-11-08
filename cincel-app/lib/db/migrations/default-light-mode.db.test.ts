// @vitest-environment node
/**
 * The migration that makes `light` the default `user_preferences.mode`: a row
 * created without a mode (a first save of density only, say) starts in light
 * Azul Cincel, and rows saved before it keep the mode they had.
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

const TAG_SUFFIX = "_default_light_mode";

/** Tag of the migration, whatever number drizzle-kit gave it. */
function migrationTag(): string {
  const journal = JSON.parse(readFileSync(join(__dirname, "meta/_journal.json"), "utf8")) as {
    entries: { tag: string }[];
  };
  const entry = journal.entries.find((e) => e.tag.endsWith(TAG_SUFFIX));
  if (!entry) throw new Error("default light mode migration not in the journal");
  return entry.tag;
}

const canCreate = await canCreateDatabases();

async function staff(sql: postgres.Sql, name: string): Promise<string> {
  const [row] = await sql`insert into core.staff (name) values (${name}) returning id`;
  return row.id as string;
}

async function mode(sql: postgres.Sql, staffId: string): Promise<string> {
  const [row] = await sql`select mode from core.user_preferences where staff_id = ${staffId}`;
  return row.mode as string;
}

describe.skipIf(!canCreate)("default light mode migration (scratch database)", () => {
  let scratch: Scratch;
  let sql: postgres.Sql;
  const saved: Record<"defaulted" | "light" | "dark" | "system", string> = {
    defaulted: "",
    light: "",
    dark: "",
    system: "",
  };

  beforeAll(async () => {
    scratch = await createScratch("light-mode");
    sql = scratch.sql;
    await migrateBefore(sql, migrationTag());
    saved.defaulted = await staff(sql, "Ana Antes");
    await sql`insert into core.user_preferences (staff_id, density) values (${saved.defaulted}, 'compacta')`;
    for (const m of ["light", "dark", "system"] as const) {
      saved[m] = await staff(sql, `Usuario ${m}`);
      await sql`insert into core.user_preferences (staff_id, mode) values (${saved[m]}, ${m})`;
    }
    await migrateThrough(sql, migrationTag());
  }, 120_000);

  afterAll(async () => {
    await dropScratch(scratch);
    cleanupTempDirs();
  }, 60_000);

  it("a row created without a mode starts in light", async () => {
    const id = await staff(sql, "Beatriz Nueva");
    await sql`insert into core.user_preferences (staff_id, density) values (${id}, 'compacta')`;
    expect(await mode(sql, id)).toBe("light");
  });

  it("rows saved before the migration keep their mode", async () => {
    expect(await mode(sql, saved.defaulted)).toBe("system");
    expect(await mode(sql, saved.light)).toBe("light");
    expect(await mode(sql, saved.dark)).toBe("dark");
    expect(await mode(sql, saved.system)).toBe("system");
  });
});
