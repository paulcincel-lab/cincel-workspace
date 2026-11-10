// @vitest-environment node
/**
 * The redesign contracts migration (BE §4, §16): applies on an empty database
 * and on a database that already has `appearance.primary_color`; both end with
 * the Azul `appearance.theme` seed (`v = 1`, `redesignDefault = false`,
 * `redesignAvailable = true`), the `time_tracking` and `vacations` seeds, and
 * `primary_color` unchanged. Existing settings rows are never overwritten.
 *
 * Runs only when TEST_DATABASE_URL is set and its role may create databases.
 */
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { THEME_PRESETS, presetFilledTokens } from "@/lib/ui/themes";

import {
  canCreateDatabases,
  cleanupTempDirs,
  createScratch,
  dropScratch,
  migrateBefore,
  migrateThrough,
  redesignTag,
  type Scratch,
} from "./redesign-test-helpers";

const canCreate = await canCreateDatabases();

async function setting(sql: postgres.Sql, key: string): Promise<string | null> {
  const [row] = await sql`select value from core.app_settings where key = ${key}`;
  return row ? (row.value as string) : null;
}

async function seededAppearance(sql: postgres.Sql) {
  const raw = await setting(sql, "appearance.theme");
  expect(raw).not.toBeNull();
  return JSON.parse(raw!) as { version: number; data: Record<string, unknown> };
}

describe.skipIf(!canCreate)("redesign contracts migration (scratch databases)", () => {
  const scratches: Scratch[] = [];
  const tag = canCreate ? redesignTag() : "";

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

    beforeAll(async () => {
      sql = await scratch("empty");
      await migrateThrough(sql, tag);
    }, 120_000);

    it("seeds appearance.theme with the Azul preset, v = 1 and the flag defaults", async () => {
      const stored = await seededAppearance(sql);
      expect(stored.version).toBe(1);
      // The seed is the Azul preset of its migration: tokens added since fill from the preset when read
      // (`presetFilledTokens`), and the type scale keeps that migration's values (TYPE_SCALE_DEFAULT moved later).
      const { tokens, typeScale: _seededTypeScale, ...rest } = stored.data as { tokens: Record<string, unknown>; typeScale: unknown };
      const { tokens: presetTokens, typeScale: _presetTypeScale, ...presetRest } = THEME_PRESETS.azul;
      expect(rest).toEqual({ ...presetRest, redesignDefault: false, redesignAvailable: true, v: 1 });
      expect(presetFilledTokens("azul", tokens as Parameters<typeof presetFilledTokens>[1])).toEqual(presetTokens);
      expect(stored.data.baseTheme).toBe("azul");
      expect(stored.data.redesignDefault).toBe(false);
      expect(stored.data.redesignAvailable).toBe(true);
      expect(stored.data.styleDefault).toBe("visual");
      expect(stored.data.allowUserOverride).toBe(true);
      expect(stored.data.fontFamily).toBe("Geist");
    });

    it("seeds time_tracking disabled and vacations with 12 days", async () => {
      expect(JSON.parse((await setting(sql, "time_tracking"))!)).toEqual({
        version: 1,
        data: {
          enabled: false,
          requiredFrom: null,
          dayStart: "09:00",
          dayEnd: "18:00",
          hoursPerDay: 8,
          lateToleranceMin: 15,
          workDays: [1, 2, 3, 4, 5],
          promptAtLogin: true,
          autoCloseAt: "20:00",
          lunchMinutes: 60,
          exemptRoles: [],
        },
      });
      expect(JSON.parse((await setting(sql, "vacations"))!)).toEqual({ version: 1, data: { daysPerYear: 12 } });
    });

    it("does not create appearance.primary_color", async () => {
      expect(await setting(sql, "appearance.primary_color")).toBeNull();
    });

    it("adds the four history_entity values", async () => {
      const rows = await sql`
        select e.enumlabel as label from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = 'core' and t.typname = 'history_entity'`;
      const labels = rows.map((r) => r.label as string);
      for (const value of ["note", "reminder", "time_entry", "vacation_request"]) expect(labels).toContain(value);
    });

    it("creates every redesign table", async () => {
      const rows = await sql`select table_name from information_schema.tables where table_schema = 'core'`;
      const names = new Set(rows.map((r) => r.table_name as string));
      for (const table of [
        "user_preferences",
        "staff_photos",
        "notifications",
        "notification_preferences",
        "notes",
        "checklists",
        "checklist_items",
        "reminders",
        "gmail_accounts",
        "gmail_threads",
        "time_entries",
        "vacation_requests",
        "assistant_threads",
        "assistant_messages",
        "assistant_actions",
        "cron_runs",
        "cron_leases",
      ]) {
        expect(names.has(table), table).toBe(true);
      }
      const [col] = await sql`
        select data_type from information_schema.columns
        where table_schema = 'core' and table_name = 'staff_profiles' and column_name = 'vacation_days'`;
      expect(col?.data_type).toBe("integer");
    });
  });

  describe("database with appearance.primary_color set", () => {
    let sql: postgres.Sql;
    const PRIMARY = "blue-600";

    beforeAll(async () => {
      sql = await scratch("primary");
      await migrateBefore(sql, tag);
      await sql`insert into core.app_settings (key, value) values ('appearance.primary_color', ${PRIMARY})`;
      await sql`insert into core.app_settings (key, value) values ('vacations', ${JSON.stringify({ version: 1, data: { daysPerYear: 20 } })})`;
      await migrateThrough(sql, tag);
    }, 120_000);

    it("keeps primary_color unchanged and still seeds Azul", async () => {
      expect(await setting(sql, "appearance.primary_color")).toBe(PRIMARY);
      const stored = await seededAppearance(sql);
      expect(stored.data.baseTheme).toBe("azul");
      expect(stored.data.v).toBe(1);
    });

    it("leaves an existing settings row untouched (seed only when missing)", async () => {
      expect(JSON.parse((await setting(sql, "vacations"))!)).toEqual({ version: 1, data: { daysPerYear: 20 } });
    });
  });
});
