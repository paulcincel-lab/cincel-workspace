// @vitest-environment node
/**
 * Every redesign constraint of BE §16 against real Postgres, including one
 * open time entry per staff under concurrent inserts. Runs on a scratch
 * database migrated through the redesign contracts migration.
 *
 * Runs only when TEST_DATABASE_URL is set and its role may create databases.
 */
import type postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  canCreateDatabases,
  cleanupTempDirs,
  createScratch,
  dropScratch,
  inRollback,
  migrateThrough,
  redesignTag,
  type Scratch,
  violated,
} from "./redesign-test-helpers";

const canCreate = await canCreateDatabases();

describe.skipIf(!canCreate)("redesign constraints (BE §16)", () => {
  let scratch: Scratch;
  let sql: postgres.Sql;
  let staffId: string;

  beforeAll(async () => {
    scratch = await createScratch("constraints", 4);
    sql = scratch.sql;
    await migrateThrough(sql, redesignTag());
    const [row] = await sql`insert into core.staff (name) values ('Ana Prueba') returning id`;
    staffId = row.id as string;
  }, 120_000);

  afterAll(async () => {
    await dropScratch(scratch);
    cleanupTempDirs();
  }, 60_000);

  it("user_preferences: text size must be one of the allowed steps", async () => {
    await inRollback(sql, async (tx) => {
      expect(await violated(tx, (sp) => sp`insert into core.user_preferences (staff_id, text_size) values (${staffId}, 14.5)`)).toBeNull();
    });
    await inRollback(sql, async (tx) => {
      expect(await violated(tx, (sp) => sp`insert into core.user_preferences (staff_id, text_size) values (${staffId}, 17)`)).toBe(
        "user_preferences_text_size_check",
      );
    });
  });

  it("user_preferences: quiet hours are both set or both null", async () => {
    await inRollback(sql, async (tx) => {
      expect(
        await violated(tx, (sp) => sp`insert into core.user_preferences (staff_id, quiet_from) values (${staffId}, '22:00')`),
      ).toBe("user_preferences_quiet_pair_check");
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.user_preferences (staff_id, quiet_from, quiet_to) values (${staffId}, '22:00', '07:00')`,
        ),
      ).toBeNull();
    });
  });

  it("notes: title or body must be non-empty", async () => {
    await inRollback(sql, async (tx) => {
      expect(await violated(tx, (sp) => sp`insert into core.notes (staff_id) values (${staffId})`)).toBe("notes_not_empty_check");
      expect(await violated(tx, (sp) => sp`insert into core.notes (staff_id, body) values (${staffId}, 'hola')`)).toBeNull();
    });
  });

  it("checklist_items: text can't be blank", async () => {
    await inRollback(sql, async (tx) => {
      const [list] = await tx`insert into core.checklists (staff_id, title) values (${staffId}, 'Obra') returning id`;
      expect(
        await violated(tx, (sp) => sp`insert into core.checklist_items (checklist_id, text, sort_order) values (${list.id}, '   ', 0)`),
      ).toBe("checklist_items_text_check");
      expect(
        await violated(tx, (sp) => sp`insert into core.checklist_items (checklist_id, text, sort_order) values (${list.id}, 'Planos', 0)`),
      ).toBeNull();
    });
  });

  it("reminders: channels are a non-empty subset of app / email", async () => {
    await inRollback(sql, async (tx) => {
      const insert = (channels: string) => (sp: postgres.TransactionSql) =>
        sp`insert into core.reminders (staff_id, text, due_at, channels) values (${staffId}, 'Llamar', now(), ${channels}::text[])`;
      expect(await violated(tx, insert("{}"))).toBe("reminders_channels_check");
      expect(await violated(tx, insert("{sms}"))).toBe("reminders_channels_check");
      expect(await violated(tx, insert("{app,email}"))).toBeNull();
    });
  });

  it("notifications: at least one delivery channel, and entity / entity_id come in pairs", async () => {
    await inRollback(sql, async (tx) => {
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.notifications (staff_id, kind, title, in_app, email_status, digest)
                     values (${staffId}, 'sistema', 'Hola', false, 'none', false)`,
        ),
      ).toBe("notifications_delivery_check");
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.notifications (staff_id, kind, title, in_app, entity)
                     values (${staffId}, 'sistema', 'Hola', true, 'task')`,
        ),
      ).toBe("notifications_entity_pair_check");
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.notifications (staff_id, kind, title, in_app, email_status)
                     values (${staffId}, 'asignacion', 'Hola', false, 'pending')`,
        ),
      ).toBeNull();
    });
  });

  it("notifications: one row per staff and dedupe key", async () => {
    await inRollback(sql, async (tx) => {
      const insert = (sp: postgres.TransactionSql) =>
        sp`insert into core.notifications (staff_id, kind, title, in_app, dedupe_key)
           values (${staffId}, 'vencimiento', 'Vence', true, 'vencimiento:x:2026-11-09')`;
      expect(await violated(tx, insert)).toBeNull();
      expect(await violated(tx, insert)).toBe("notifications_dedupe_uq");
    });
  });

  it("time_entries: ended_at after started_at, closed_by set exactly when closed", async () => {
    await inRollback(sql, async (tx) => {
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.time_entries (staff_id, work_date, started_at, ended_at, closed_by, source)
                     values (${staffId}, '2026-11-09', '2026-11-09T15:00:00Z', '2026-11-09T14:00:00Z', 'user', 'sidebar')`,
        ),
      ).toBe("time_entries_order_check");
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.time_entries (staff_id, work_date, started_at, ended_at, source)
                     values (${staffId}, '2026-11-09', '2026-11-09T15:00:00Z', '2026-11-09T16:00:00Z', 'sidebar')`,
        ),
      ).toBe("time_entries_closed_by_check");
    });
  });

  it("time_entries: concurrent clock-ins leave exactly one open entry per staff", async () => {
    const [other] = await sql`insert into core.staff (name) values ('Beto Prueba') returning id`;
    const clockIn = () =>
      sql.begin(async (tx) => {
        await tx`insert into core.time_entries (staff_id, work_date, started_at, source)
                 values (${other.id}, '2026-11-09', now(), 'sidebar')`;
        await tx`select pg_sleep(0.2)`;
      });
    const results = await Promise.allSettled([clockIn(), clockIn()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rejected.reason as { constraint_name?: string }).constraint_name).toBe("time_entries_one_open_uq");
    const [count] = await sql`select count(*)::int as n from core.time_entries where staff_id = ${other.id} and ended_at is null`;
    expect(count.n).toBe(1);
  });

  it("vacation_requests: to >= from and days > 0", async () => {
    await inRollback(sql, async (tx) => {
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.vacation_requests (staff_id, from_date, to_date, kind, days)
                     values (${staffId}, '2026-12-10', '2026-12-09', 'vacaciones', 1)`,
        ),
      ).toBe("vacation_requests_range_check");
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.vacation_requests (staff_id, from_date, to_date, kind, days)
                     values (${staffId}, '2026-12-12', '2026-12-13', 'vacaciones', 0)`,
        ),
      ).toBe("vacation_requests_days_check");
    });
  });

  it("staff_photos: jpeg / png / webp only, at most 1 MiB", async () => {
    await inRollback(sql, async (tx) => {
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.staff_photos (staff_id, mime, bytes, sha256) values (${staffId}, 'image/gif', '\\x00'::bytea, 'x')`,
        ),
      ).toBe("staff_photos_mime_check");
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.staff_photos (staff_id, mime, bytes, sha256)
                     values (${staffId}, 'image/jpeg', decode(repeat('00', 1048577), 'hex'), 'x')`,
        ),
      ).toBe("staff_photos_size_check");
      expect(
        await violated(
          tx,
          (sp) => sp`insert into core.staff_photos (staff_id, mime, bytes, sha256) values (${staffId}, 'image/png', '\\x89'::bytea, 'x')`,
        ),
      ).toBeNull();
    });
  });

  it("staff_profiles: vacation_days >= 0", async () => {
    await inRollback(sql, async (tx) => {
      expect(
        await violated(tx, (sp) => sp`insert into core.staff_profiles (staff_id, vacation_days) values (${staffId}, -1)`),
      ).toBe("staff_profiles_vacation_days_check");
      expect(
        await violated(tx, (sp) => sp`insert into core.staff_profiles (staff_id, vacation_days) values (${staffId}, 15)`),
      ).toBeNull();
    });
  });
});
