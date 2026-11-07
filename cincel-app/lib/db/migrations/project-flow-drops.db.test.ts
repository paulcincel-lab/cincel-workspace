// @vitest-environment node
/**
 * 0025 (BE §4.3, §16) on two scratch databases:
 *   - a fresh one, every migration in the journal applied in order;
 *   - a dev-like one migrated to 0022, filled with pre-project-flow data (free-text fases,
 *     an área with a member and a tramo, an area group mapping, projects.phases), then 0023 + 0024,
 *     then rows written by release A, then 0025.
 * Runs only when TEST_DATABASE_URL points at a Postgres whose user may create databases.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const migrationsDir = join(__dirname);

const DROPS = "0025_project_flow_drops";
/** The re-snapshot inserts at the top of 0025 (BE §4.3 step 1). */
const RESNAPSHOT_STATEMENTS = 5;

type Journal = { entries: { idx: number; tag: string }[] };

function statementsOf(tag: string): string[] {
  const text = readFileSync(join(migrationsDir, `${tag}.sql`), "utf8");
  return text
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.split("\n").some((line) => line.trim() !== "" && !line.trim().startsWith("--")));
}

function journalTags(): { idx: number; tag: string }[] {
  const journal = JSON.parse(readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf8")) as Journal;
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

function tagsBetween(fromIdx: number, toIdx: number): string[] {
  return journalTags()
    .filter((e) => e.idx >= fromIdx && e.idx < toIdx)
    .map((e) => e.tag);
}

async function applyInOneTransaction(sql: postgres.Sql, tags: string[]) {
  await sql.begin(async (tx) => {
    for (const tag of tags) {
      for (const statement of statementsOf(tag)) await tx.unsafe(statement);
    }
  });
}

type Scratch = { sql: postgres.Sql; drop: () => Promise<void> };

async function scratchDatabase(): Promise<Scratch> {
  const admin = postgres(url!, { max: 1, onnotice: () => {} });
  const dbName = `cincel_pf_drops_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await admin.unsafe(`create database "${dbName}"`);
  const target = new URL(url!);
  target.pathname = `/${dbName}`;
  const sql = postgres(target.toString(), { max: 1, onnotice: () => {} });
  return {
    sql,
    drop: async () => {
      await sql.end();
      await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
      await admin.end();
    },
  };
}

async function columnExists(sql: postgres.Sql, table: string, column: string) {
  const [row] = await sql`
    select count(*)::int as n from information_schema.columns
    where table_schema = 'core' and table_name = ${table} and column_name = ${column}`;
  return row.n > 0;
}

async function tableExists(sql: postgres.Sql, table: string) {
  const [row] = await sql`
    select count(*)::int as n from information_schema.tables
    where table_schema = 'core' and table_name = ${table}`;
  return row.n > 0;
}

async function expectReleaseBSchema(sql: postgres.Sql) {
  expect(await columnExists(sql, "tasks", "phase")).toBe(false);
  expect(await columnExists(sql, "workflow_task_templates", "phase")).toBe(false);
  expect(await columnExists(sql, "projects", "phase")).toBe(false);
  expect(await columnExists(sql, "projects", "phases")).toBe(false);
  expect(await columnExists(sql, "workspace_group_mappings", "area_id")).toBe(false);
  expect(await tableExists(sql, "areas")).toBe(false);
  expect(await tableExists(sql, "area_members")).toBe(false);
  expect(await tableExists(sql, "area_workflows")).toBe(false);
  expect(await tableExists(sql, "project_flow_migration_report")).toBe(true);

  const [phaseId] = await sql`
    select is_nullable from information_schema.columns
    where table_schema = 'core' and table_name = 'workflow_task_templates' and column_name = 'phase_id'`;
  expect(phaseId.is_nullable).toBe("NO");

  const [fn] = await sql`
    select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'core' and p.proname = 'flow_name_key'`;
  expect(fn.n).toBe(0);

  const labels = await sql`
    select e.enumlabel from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace ns on ns.oid = t.typnamespace
    where ns.nspname = 'core' and t.typname = 'history_entity'`;
  expect(labels.map((r) => r.enumlabel)).toContain("area");
}

describe.skipIf(!url)("0025 on a fresh database", () => {
  let db: Scratch;

  beforeAll(async () => {
    db = await scratchDatabase();
    await applyInOneTransaction(db.sql, tagsBetween(0, Number.POSITIVE_INFINITY));
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  it("applies with every earlier migration and leaves the release B schema", async () => {
    await expectReleaseBSchema(db.sql);
  });
});

describe.skipIf(!url)("0025 on top of the 0024 dev-like fixture", () => {
  let db: Scratch;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await scratchDatabase();
    const sql = db.sql;
    await applyInOneTransaction(sql, tagsBetween(0, 23));

    // Pre-project-flow data, as on the dev install.
    const [staffRow] = await sql`insert into core.staff (name) values ('Ana Prueba') returning id`;
    ids.staff = staffRow.id;
    const [client] = await sql`insert into core.contacts (type, name) values ('cliente', 'Cliente Prueba') returning id`;
    ids.client = client.id;
    const [presale] = await sql`
      insert into core.workflows (key, name, sort_order) values ('presale', 'Presale', 0) returning id`;
    const [diseno] = await sql`
      insert into core.workflows (key, name, sort_order) values ('diseno', 'Diseno', 1) returning id`;
    ids.presale = presale.id;
    ids.diseno = diseno.id;

    const [madrid] = await sql`
      insert into core.projects (name, client_id, phase, phases)
      values ('Madrid 22', ${ids.client}, 'Anteproyecto', array['Anteproyecto', 'Ejecutivo'])
      returning id`;
    ids.madrid = madrid.id;
    const [later] = await sql`
      insert into core.projects (name, client_id) values ('Casa Lomas', ${ids.client}) returning id`;
    ids.later = later.id;

    await sql`
      insert into core.workflow_task_templates (workflow_id, phase, title, sort_order)
      values (${ids.diseno}, 'Proyecto Arquitectonico', 'Revisión con cliente', 90),
             (${ids.diseno}, 'Fase sin catálogo', 'Entrega especial', 91)`;

    const task = async (title: string, phase: string | null, workflowId: string | null) => {
      const [row] = await sql`
        insert into core.tasks (project_id, kind, workflow_id, title, phase, status, created_by_id)
        values (${ids.madrid}, 'usuario', ${workflowId}, ${title}, ${phase}, 'pendiente', ${ids.staff})
        returning id`;
      return row.id as string;
    };
    ids.matched = await task("Croquis", "Proyecto Arquitectónico", ids.diseno);
    ids.unmatchedBefore = await task("Pendiente raro", "Fase inventada", ids.diseno);

    const [area] = await sql`insert into core.areas (name) values ('Diseño') returning id`;
    ids.area = area.id;
    await sql`insert into core.area_members (area_id, staff_id, role) values (${ids.area}, ${ids.staff}, 'Lider')`;
    await sql`insert into core.area_workflows (area_id, workflow_id) values (${ids.area}, ${ids.diseno})`;
    await sql`
      insert into core.workspace_group_mappings (group_email, group_id, kind, area_id)
      values ('diseno@example.com', 'g-diseno', 'area', ${ids.area})`;

    await applyInOneTransaction(sql, tagsBetween(23, 25));

    // Rows written by release A after 0024 ran.
    ids.unmatchedAfter = await task("Otra pendiente", "Fase escrita después", ids.presale);
    await sql`update core.projects set phases = array['Obra negra'] where id = ${ids.later}`;
    const [area2] = await sql`insert into core.areas (name) values ('Decoración') returning id`;
    ids.area2 = area2.id;
    const [staff2] = await sql`insert into core.staff (name) values ('Luis Prueba') returning id`;
    ids.staff2 = staff2.id;
    await sql`insert into core.area_members (area_id, staff_id, role) values (${ids.area2}, ${ids.staff2}, null)`;
    await sql`insert into core.area_workflows (area_id, workflow_id) values (${ids.area2}, ${ids.presale})`;

    // The re-snapshot inserts once by hand first, so 0025 runs them a second time.
    await sql.begin(async (tx) => {
      for (const statement of statementsOf(DROPS).slice(0, RESNAPSHOT_STATEMENTS)) await tx.unsafe(statement);
    });
    await applyInOneTransaction(sql, [DROPS]);
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  async function reportRows(kind: string) {
    return db.sql`
      select entity, entity_id, value, detail from core.project_flow_migration_report where kind = ${kind}`;
  }

  it("leaves the release B schema", async () => {
    await expectReleaseBSchema(db.sql);
  });

  it("keeps every template with a fase", async () => {
    const [row] = await db.sql`
      select count(*)::int as n from core.workflow_task_templates where phase_id is null`;
    expect(row.n).toBe(0);
  });

  it("captures rows written after 0024", async () => {
    const unmatched = await reportRows("task_phase_unmatched");
    const byTask = new Map(unmatched.map((r) => [r.entity_id as string, r]));
    expect(byTask.get(ids.unmatchedBefore)?.value).toBe("Fase inventada");
    expect(byTask.get(ids.unmatchedAfter)?.value).toBe("Fase escrita después");
    expect(byTask.get(ids.unmatchedAfter)?.detail).toEqual({ projectId: ids.madrid, workflowKey: "presale" });
    expect(byTask.has(ids.matched)).toBe(false);

    const phases = await reportRows("project_phases");
    const byProject = new Map(phases.map((r) => [r.entity_id as string, r.value as string]));
    expect(byProject.get(ids.madrid)).toBe("Anteproyecto · Ejecutivo");
    expect(byProject.get(ids.later)).toBe("Obra negra");

    const areas = await reportRows("area");
    expect(areas.map((r) => r.entity_id).sort()).toEqual([ids.area, ids.area2].sort());
    const newArea = areas.find((r) => r.entity_id === ids.area2)!;
    expect(newArea.detail).toMatchObject({ name: "Decoración", members: 1 });

    const members = await reportRows("area_member");
    expect(members.map((r) => `${r.entity_id}:${r.value}`).sort()).toEqual(
      [`${ids.area}:${ids.staff}`, `${ids.area2}:${ids.staff2}`].sort()
    );

    const workflows = await reportRows("area_workflow");
    expect(workflows.map((r) => `${r.entity_id}:${r.value}`).sort()).toEqual(
      [`${ids.area}:${ids.diseno}`, `${ids.area2}:${ids.presale}`].sort()
    );
  });

  it("writes each re-snapshot row once", async () => {
    const dup = await db.sql`
      select kind, entity, entity_id, value, count(*)::int as n
      from core.project_flow_migration_report
      where kind in ('task_phase_unmatched', 'project_phases', 'area', 'area_member', 'area_workflow')
      group by kind, entity, entity_id, value
      having count(*) > 1`;
    expect(dup).toHaveLength(0);

    const [madridPhases] = await db.sql`
      select count(*)::int as n from core.project_flow_migration_report
      where kind = 'project_phases' and entity_id = ${ids.madrid}`;
    expect(madridPhases.n).toBe(1);
  });

  it("keeps the group mappings, without area_id", async () => {
    const rows = await db.sql`select kind::text as kind from core.workspace_group_mappings`;
    expect(rows.map((r) => r.kind)).not.toContain("area");
  });
});
