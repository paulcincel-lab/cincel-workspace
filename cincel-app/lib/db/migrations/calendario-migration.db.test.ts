// @vitest-environment node
/**
 * The Calendario contracts migration (BE §3, §4): tables, checks, indexes and
 * enum values land in one migration that applies on an empty database.
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
  inRollback,
  migrateThrough,
  violated,
  type Scratch,
} from "./redesign-test-helpers";

const TAG_SUFFIX = "_calendario_contracts";

function migrationTag(): string {
  const journal = JSON.parse(readFileSync(join(__dirname, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  const entry = journal.entries.find((e) => e.tag.endsWith(TAG_SUFFIX));
  if (!entry) throw new Error("calendario contracts migration not in the journal");
  return entry.tag;
}

const canCreate = await canCreateDatabases();

describe.skipIf(!canCreate)("calendario contracts migration (scratch database)", () => {
  let scratch: Scratch;
  let sql: postgres.Sql;
  let staffId: string;

  beforeAll(async () => {
    scratch = await createScratch("calendario");
    sql = scratch.sql;
    await migrateThrough(sql, migrationTag());
    const [row] = await sql`insert into core.staff (name) values ('Ana Prueba') returning id`;
    staffId = row.id as string;
  }, 120_000);

  afterAll(async () => {
    await dropScratch(scratch);
    cleanupTempDirs();
  }, 60_000);

  it("creates the tables", async () => {
    const rows = await sql`select table_name from information_schema.tables where table_schema = 'core'`;
    const names = new Set(rows.map((r) => r.table_name as string));
    for (const table of [
      "calendar_events",
      "calendar_event_attendees",
      "meeting_minutes",
      "meeting_decisions",
      "meeting_minute_tasks",
      "assistant_proposals",
    ]) {
      expect(names.has(table), table).toBe(true);
    }
  });

  it("adds the enum values and the new enums", async () => {
    const values = async (name: string) =>
      (await sql`select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = ${name} order by e.enumsortorder`).map(
        (r) => r.enumlabel as string,
      );
    expect(await values("history_entity")).toContain("calendar_event");
    expect(await values("notification_kind")).toContain("reunion");
    expect(await values("calendar_event_source")).toEqual(["cincel", "google"]);
    expect(await values("calendar_event_status")).toEqual(["confirmada", "cancelada"]);
    expect(await values("attendee_response")).toEqual(["pendiente", "acepta", "rechaza", "tentativo"]);
    expect(await values("meeting_minutes_status")).toEqual(["borrador", "lista", "enviada"]);
    expect(await values("proposal_status")).toEqual(["propuesta", "aplicada", "parcial", "cancelada", "expirada", "deshecha"]);
    expect(await values("proposal_kind")).toHaveLength(9);
  });

  it("adds the hours columns, their checks and the sync columns", async () => {
    const cols = await sql`select table_name, column_name from information_schema.columns where table_schema = 'core'
      and ((table_name = 'tasks' and column_name = 'estimated_hours')
        or (table_name = 'workflow_task_templates' and column_name = 'default_estimated_hours')
        or (table_name = 'google_calendar_syncs' and column_name in ('primary_sync_token', 'primary_synced_at', 'primary_error', 'primary_window_from', 'primary_window_to')))`;
    expect(cols).toHaveLength(7);
    const checks = await sql`select conname from pg_constraint where conname in ('tasks_estimated_hours_check', 'workflow_task_templates_estimated_hours_check')`;
    expect(checks).toHaveLength(2);
    const [idx] = await sql`select indexname from pg_indexes where schemaname = 'core' and indexname = 'idx_tasks_due'`;
    expect(idx).toBeDefined();
  });

  it("rejects events that end before they start and a bad invites_via", async () => {
    await inRollback(sql, async (tx) => {
      expect(
        await violated(tx, (sp) => sp`insert into core.calendar_events (source, title, starts_at, ends_at, created_by_id)
          values ('cincel', 'Junta', '2026-11-12T10:00:00Z', '2026-11-12T09:00:00Z', ${staffId})`),
      ).toBe("calendar_events_time_check");
      expect(
        await violated(tx, (sp) => sp`insert into core.calendar_events (source, title, starts_at, ends_at, invites_via, created_by_id)
          values ('cincel', 'Junta', '2026-11-12T10:00:00Z', '2026-11-12T11:00:00Z', 'correo', ${staffId})`),
      ).toBe("calendar_events_invites_via_check");
      const [ok] = await tx`insert into core.calendar_events (source, title, starts_at, ends_at, invites_via, created_by_id)
        values ('cincel', 'Junta', '2026-11-12T10:00:00Z', '2026-11-12T11:00:00Z', 'google', ${staffId}) returning id, status, time_zone`;
      expect(ok.status).toBe("confirmada");
      expect(ok.time_zone).toBe("America/Mexico_City");
    });
  });

  it("keeps one attendee per email and one minutes row per event", async () => {
    await inRollback(sql, async (tx) => {
      const [event] = await tx`insert into core.calendar_events (source, title, starts_at, ends_at, created_by_id)
        values ('cincel', 'Junta', '2026-11-12T10:00:00Z', '2026-11-12T11:00:00Z', ${staffId}) returning id`;
      await tx`insert into core.calendar_event_attendees (event_id, email, name) values (${event.id}, 'Ana@Example.test', 'Ana')`;
      expect(
        await violated(tx, (sp) => sp`insert into core.calendar_event_attendees (event_id, email, name) values (${event.id}, 'ana@example.test', 'Ana')`),
      ).toBe("calendar_event_attendees_email_uq");
      await tx`insert into core.meeting_minutes (event_id) values (${event.id})`;
      expect(await violated(tx, (sp) => sp`insert into core.meeting_minutes (event_id) values (${event.id})`)).toBe("meeting_minutes_event_uq");
    });
  });

  it("defaults a proposal to propuesta with empty applied and deferred lists", async () => {
    await inRollback(sql, async (tx) => {
      const [row] = await tx`insert into core.assistant_proposals (staff_id, kind, title, line, changes, expires_at)
        values (${staffId}, 'mover_tareas', 'Mover 3 tareas', 'Al jueves', '[]'::jsonb, now() + interval '24 hours')
        returning status, applied, deferred`;
      expect(row.status).toBe("propuesta");
      expect(row.applied).toEqual([]);
      expect(row.deferred).toEqual([]);
    });
  });
});
