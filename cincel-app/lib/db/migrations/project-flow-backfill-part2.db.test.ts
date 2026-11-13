// @vitest-environment node
/**
 * 0023 + 0024 on a fresh scratch database, BE §4.2 steps 9–15: stages, current etapa, duplicate
 * names and the projects_name_lower_uq swap, áreas report, group mapping kind 'area' → 'position'
 * (with and without an existing area mapping), puestos seed, and a second run of 0024.
 * Runs only when TEST_DATABASE_URL points at a Postgres whose user may create databases.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const migrationsDir = join(__dirname);

type Journal = { entries: { idx: number; tag: string }[] };

function statementsOf(tag: string): string[] {
  const text = readFileSync(join(migrationsDir, `${tag}.sql`), "utf8");
  return text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.split("\n").some((line) => line.trim() !== "" && !line.trim().startsWith("--")));
}

function tagsBefore(idx: number): string[] {
  const journal = JSON.parse(readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8")) as Journal;
  return journal.entries.filter((e) => e.idx < idx).sort((a, b) => a.idx - b.idx).map((e) => e.tag);
}

async function applyInOneTransaction(sql: postgres.Sql, tags: string[]) {
  await sql.begin(async (tx) => {
    for (const tag of tags) {
      for (const statement of statementsOf(tag)) await tx.unsafe(statement);
    }
  });
}

const BACKFILL = "0024_project_flow_backfill";

type Fixture = {
  sql: postgres.Sql;
  ids: Record<string, string>;
  drop: () => Promise<void>;
};

/** A scratch database migrated up to 0022, filled with pre-project-flow data, then 0023 + 0024. */
async function makeFixture(withAreaMapping: boolean): Promise<Fixture> {
  const admin = postgres(url!, { max: 1, onnotice: () => {} });
  const dbName = `cincel_pf_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await admin.unsafe(`create database "${dbName}"`);
  const target = new URL(url!);
  target.pathname = `/${dbName}`;
  const sql = postgres(target.toString(), { max: 1, onnotice: () => {} });

  await applyInOneTransaction(sql, tagsBefore(23));

  const ids: Record<string, string> = {};
  const [staffRow] = await sql`insert into core.staff (name) values ('Ana Prueba') returning id`;
  ids.staff = staffRow.id;
  const [client] = await sql`insert into core.contacts (type, name) values ('cliente', 'Cliente Prueba') returning id`;
  ids.client = client.id;
  // The pre-0024 index is unique per client, so the duplicate names need distinct clients.
  const [clientB] = await sql`insert into core.contacts (type, name) values ('cliente', 'Cliente B') returning id`;
  const [clientC] = await sql`insert into core.contacts (type, name) values ('cliente', 'Cliente C') returning id`;
  ids.clientB = clientB.id;
  ids.clientC = clientC.id;
  const [presale] = await sql`
    insert into core.workflows (key, name, sort_order) values ('presale', 'Presale', 0) returning id`;
  const [diseno] = await sql`
    insert into core.workflows (key, name, sort_order) values ('diseno', 'Diseno', 1) returning id`;
  ids.presale = presale.id;
  ids.diseno = diseno.id;

  const project = async (name: string, createdAt: string, status = "activo", clientId = ids.client) => {
    const [row] = await sql`
      insert into core.projects (name, client_id, status, created_at)
      values (${name}, ${clientId}, ${status}::core.project_status, ${createdAt}::timestamptz)
      returning id`;
    return row.id as string;
  };
  ids.flow = await project("Casa Lomas", "2026-01-01");
  ids.empty = await project("Sin Etapa", "2026-01-02");
  ids.x1 = await project("X", "2026-01-03");
  ids.x2 = await project("X", "2026-01-04", "activo", ids.clientB);
  ids.x3 = await project("X (2)", "2026-01-05");
  ids.xDone = await project("X", "2026-01-06", "completado", ids.clientC);

  const task = async (workflowId: string, title: string, status: string, createdAt: string) => {
    await sql`
      insert into core.tasks (project_id, kind, workflow_id, title, status, created_by_id, created_at, updated_at)
      values (${ids.flow}, 'usuario', ${workflowId}, ${title}, ${status}::core.task_status, ${ids.staff},
              ${createdAt}::timestamptz, ${createdAt}::timestamptz)`;
  };
  await task(ids.presale, "Llamada inicial", "completado", "2026-02-01T00:00:00Z");
  await task(ids.presale, "Visita", "completado", "2026-02-03T00:00:00Z");
  await task(ids.diseno, "Croquis", "pendiente", "2026-03-01T00:00:00Z");

  const [area] = await sql`insert into core.areas (name) values ('Diseño') returning id`;
  ids.area = area.id;
  await sql`insert into core.area_members (area_id, staff_id, role) values (${ids.area}, ${ids.staff}, 'Lider')`;
  await sql`insert into core.area_workflows (area_id, workflow_id) values (${ids.area}, ${ids.diseno})`;

  await sql`
    insert into core.workspace_group_mappings (group_email, group_id, kind, role, rank)
    values ('admins@example.com', 'g-admins', 'role', 'admin', 1)`;
  if (withAreaMapping) {
    const [mapping] = await sql`
      insert into core.workspace_group_mappings (group_email, group_id, kind, area_id)
      values ('diseno@example.com', 'g-diseno', 'area', ${ids.area})
      returning id`;
    ids.areaMapping = mapping.id;
  }

  await applyInOneTransaction(sql, ["0023_project_flow_schema", BACKFILL]);

  return {
    sql,
    ids,
    drop: async () => {
      await sql.end();
      await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
      await admin.end();
    },
  };
}

async function reportRows(sql: postgres.Sql, kind: string) {
  return sql`select entity, entity_id, value, detail from core.project_flow_migration_report where kind = ${kind}`;
}

describe.skipIf(!url)("0024 steps 9–15 on a scratch database", () => {
  for (const withAreaMapping of [true, false]) {
    describe(withAreaMapping ? "with an area group mapping" : "without an area group mapping", () => {
      backfillSuite(withAreaMapping);
    });
  }
});

function backfillSuite(withAreaMapping: boolean) {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await makeFixture(withAreaMapping);
  }, 120_000);

  afterAll(async () => {
    await fx?.drop();
  }, 60_000);

  it("writes stage rows with started_at and closed_at", async () => {
    const stages = await fx.sql`
      select workflow_id, started_at, closed_at from core.project_stages where project_id = ${fx.ids.flow}`;
    const byWorkflow = new Map(stages.map((s) => [s.workflow_id as string, s]));
    expect(byWorkflow.size).toBe(2);
    const presale = byWorkflow.get(fx.ids.presale)!;
    const diseno = byWorkflow.get(fx.ids.diseno)!;
    expect(new Date(presale.started_at).toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(presale.closed_at).not.toBeNull();
    expect(new Date(diseno.started_at).toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(diseno.closed_at).toBeNull();
  });

  it("sets the current etapa to the highest started one and reports projects without one", async () => {
    const [flow] = await fx.sql`select current_workflow_id from core.projects where id = ${fx.ids.flow}`;
    expect(flow.current_workflow_id).toBe(fx.ids.diseno);

    const rows = await reportRows(fx.sql, "project_without_tramo");
    const reported = rows.map((r) => r.entity_id);
    expect(reported).toContain(fx.ids.empty);
    expect(reported).not.toContain(fx.ids.flow);
  });

  it("makes active project names unique and swaps the unique index", async () => {
    const names = await fx.sql`select id, name from core.projects`;
    const byId = new Map(names.map((r) => [r.id as string, r.name as string]));
    expect(byId.get(fx.ids.x1)).toBe("X");
    expect(byId.get(fx.ids.x2)).toBe("X (3)");
    expect(byId.get(fx.ids.x3)).toBe("X (2)");
    expect(byId.get(fx.ids.xDone)).toBe("X");

    const [dup] = await fx.sql`
      select count(*)::int as n from (
        select lower(name) from core.projects
        where deleted_at is null and status in ('activo', 'pausado')
        group by lower(name) having count(*) > 1
      ) d`;
    expect(dup.n).toBe(0);

    const renamed = await reportRows(fx.sql, "project_renamed_duplicate");
    expect(renamed).toHaveLength(1);
    expect(renamed[0].entity_id).toBe(fx.ids.x2);
    expect(renamed[0].detail).toEqual({ before: "X", after: "X (3)" });

    const indexes = await fx.sql`
      select indexname from pg_indexes where schemaname = 'core' and tablename = 'projects'`;
    const indexNames = indexes.map((r) => r.indexname);
    expect(indexNames).toContain("projects_name_lower_uq");
    expect(indexNames).not.toContain("projects_client_name_lower_uq");

    await expect(
      fx.sql`insert into core.projects (name, client_id) values ('casa lomas', ${fx.ids.client})`
    ).rejects.toMatchObject({ code: "23505" });
    // Allowed against an archived one; soft-deleted again so later runs don't report it.
    const [archived] = await fx.sql`
      insert into core.projects (name, client_id, status) values ('Casa Lomas', ${fx.ids.client}, 'completado')
      returning id`;
    await fx.sql`update core.projects set deleted_at = now() where id = ${archived.id}`;
  });

  it("reports áreas, their members and their etapas", async () => {
    const areas = await reportRows(fx.sql, "area");
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({ entity: "area", entity_id: fx.ids.area, value: "Diseño" });
    expect(areas[0].detail).toMatchObject({ name: "Diseño", members: 1 });

    const members = await reportRows(fx.sql, "area_member");
    expect(members).toHaveLength(1);
    expect(members[0].detail).toMatchObject({ staffId: fx.ids.staff, areaName: "Diseño", role: "Lider" });

    const etapas = await reportRows(fx.sql, "area_workflow");
    expect(etapas).toHaveLength(1);
    expect(etapas[0].detail).toMatchObject({ areaName: "Diseño", workflowKey: "diseno" });
  });

  it("renames the group mapping kind, swaps the check and reports removed area mappings", async () => {
    const labels = await fx.sql`
      select e.enumlabel from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'core' and t.typname = 'group_mapping_kind'
      order by e.enumsortorder`;
    expect(labels.map((r) => r.enumlabel)).toEqual(["role", "position"]);

    const [check] = await fx.sql`
      select pg_get_constraintdef(oid) as def from pg_constraint
      where conname = 'workspace_group_mappings_kind_check'`;
    expect(check.def).toContain("position_id");
    expect(check.def).not.toContain("area_id");

    const mappings = await fx.sql`select kind::text as kind, group_email from core.workspace_group_mappings`;
    expect(mappings).toEqual([{ kind: "role", group_email: "admins@example.com" }]);

    const removed = await reportRows(fx.sql, "group_mapping_area_removed");
    if (withAreaMapping) {
      expect(removed).toHaveLength(1);
      expect(removed[0]).toMatchObject({ entity: "group_mapping", entity_id: fx.ids.areaMapping });
      expect(removed[0].detail).toEqual({ groupEmail: "diseno@example.com", areaName: "Diseño" });
    } else {
      expect(removed).toHaveLength(0);
    }

    await expect(
      fx.sql`
        insert into core.workspace_group_mappings (group_email, group_id, kind, role)
        values ('bad@example.com', 'g-bad', 'position', 'admin')`
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("seeds the six puestos with their candidate fases", async () => {
    const positions = await fx.sql`select name from core.positions where deleted_at is null order by sort_order`;
    expect(positions.map((r) => r.name)).toEqual([
      "Arquitecto proyectista",
      "Proyectista ejecutivo",
      "Dibujante",
      "Comercial",
      "Residente de obra",
      "Administración",
    ]);

    const candidates = await fx.sql`
      select p.name, count(pp.phase_id)::int as n
      from core.positions p left join core.position_phases pp on pp.position_id = p.id
      group by p.name`;
    const byName = new Map(candidates.map((r) => [r.name as string, r.n as number]));
    expect(byName.get("Arquitecto proyectista")).toBe(3);
    expect(byName.get("Dibujante")).toBe(2);
    expect(byName.get("Comercial")).toBe(4);
    expect(byName.get("Administración")).toBe(1);
    // No construccion etapa in this fixture, so no candidates for it.
    expect(byName.get("Residente de obra")).toBe(0);
  });

  it("runs 0024 a second time without errors or new rows", async () => {
    const before = await fx.sql`
      select kind, count(*)::int as n from core.project_flow_migration_report group by kind order by kind`;
    const [positionsBefore] = await fx.sql`select count(*)::int as n from core.positions`;
    const [phasesBefore] = await fx.sql`select count(*)::int as n from core.position_phases`;

    await applyInOneTransaction(fx.sql, [BACKFILL]);

    const after = await fx.sql`
      select kind, count(*)::int as n from core.project_flow_migration_report group by kind order by kind`;
    expect(after).toEqual(before);
    const [positionsAfter] = await fx.sql`select count(*)::int as n from core.positions`;
    const [phasesAfter] = await fx.sql`select count(*)::int as n from core.position_phases`;
    expect(positionsAfter.n).toBe(positionsBefore.n);
    expect(phasesAfter.n).toBe(phasesBefore.n);

    const [x2] = await fx.sql`select name from core.projects where id = ${fx.ids.x2}`;
    expect(x2.name).toBe("X (3)");
  });

  it("keeps an admin's soft-deleted puesto deleted on a repeat run", async () => {
    await fx.sql`update core.positions set deleted_at = now() where name = 'Dibujante'`;
    await applyInOneTransaction(fx.sql, [BACKFILL]);
    const rows = await fx.sql`select deleted_at from core.positions where lower(name) = 'dibujante'`;
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
  });
}
