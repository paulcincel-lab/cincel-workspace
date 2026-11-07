// @vitest-environment node
/**
 * Migrations 0023 + 0024 (project flow) and ensureDefaultCatalog against real
 * Postgres (BE §4.1, §4.2, §5.4, §16). Each scenario creates its own scratch
 * database next to TEST_DATABASE_URL, migrates it to 0022 with the same
 * drizzle migrator the deploy uses, loads a fixture, then applies 0023 + 0024
 * in one migrator run (as on deploy) and checks the result. The scratch
 * databases are dropped afterwards.
 *
 * Runs only when TEST_DATABASE_URL is set and its role may create databases
 * (the CI service user is the superuser).
 */
import { randomUUID } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ensureDefaultCatalog } from "@/scripts/default-catalog.mjs";
import { ensureDefaultWorkflows } from "@/scripts/default-workflows.mjs";
import { flowNameKey } from "@/tests/unit/fixtures/project-flow-catalog";

const url = process.env.TEST_DATABASE_URL;
const MIGRATIONS = resolve(__dirname);

type JournalEntry = { idx: number; tag: string; when: number };
type Journal = { entries: JournalEntry[] } & Record<string, unknown>;

class Rollback extends Error {}

const tempDirs: string[] = [];

/** A copy of lib/db/migrations holding only the migrations up to `prefix` (e.g. "0022"). */
function migrationsUpTo(prefix: string): string {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8")) as Journal;
  const last = journal.entries.findIndex((e) => e.tag.startsWith(`${prefix}_`));
  if (last < 0) throw new Error(`migration ${prefix} not in the journal`);
  const entries = journal.entries.slice(0, last + 1);
  const dir = mkdtempSync(join(tmpdir(), "cincel-pf-migrations-"));
  tempDirs.push(dir);
  mkdirSync(join(dir, "meta"));
  writeFileSync(join(dir, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const e of entries) copyFileSync(join(MIGRATIONS, `${e.tag}.sql`), join(dir, `${e.tag}.sql`));
  return dir;
}

async function migrateTo(sql: postgres.Sql, prefix: string) {
  await migrate(drizzle(sql), { migrationsFolder: migrationsUpTo(prefix) });
}

async function canCreateDatabases(): Promise<boolean> {
  if (!url) return false;
  const probe = postgres(url, { max: 1, onnotice: () => {} });
  try {
    const [row] = await probe`select (rolsuper or rolcreatedb) as ok from pg_roles where rolname = current_user`;
    return Boolean(row?.ok);
  } catch {
    return false;
  } finally {
    await probe.end();
  }
}

type Scratch = { name: string; sql: postgres.Sql };

async function createScratch(label: string): Promise<Scratch> {
  const admin = postgres(url!, { max: 1, onnotice: () => {} });
  const name = `cincel_pf_${label}_${randomUUID().slice(0, 8)}`;
  try {
    await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  const target = new URL(url!);
  target.pathname = `/${name}`;
  return { name, sql: postgres(target.toString(), { max: 1, onnotice: () => {} }) };
}

async function dropScratch(scratch: Scratch | undefined) {
  if (!scratch) return;
  await scratch.sql.end();
  const admin = postgres(url!, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists "${scratch.name}" with (force)`);
  } finally {
    await admin.end();
  }
}

async function inRollback(sql: postgres.Sql, fn: (tx: postgres.TransactionSql) => Promise<void>) {
  await sql
    .begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    })
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });
}

/** Runs `fn` in a savepoint and returns the name of the constraint it violated (or null). */
async function violated(tx: postgres.TransactionSql, fn: (sp: postgres.TransactionSql) => Promise<unknown>) {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
    return null;
  } catch (error) {
    const e = error as { constraint_name?: string; message?: string };
    return e.constraint_name ?? e.message ?? "error";
  }
}

async function groupMappingKinds(sql: postgres.Sql | postgres.TransactionSql): Promise<string[]> {
  const rows = await sql`
    select e.enumlabel as label from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'core' and t.typname = 'group_mapping_kind'
    order by e.enumsortorder`;
  return rows.map((r) => r.label as string);
}

async function constraintDef(sql: postgres.Sql, name: string): Promise<{ def: string; validated: boolean } | null> {
  const [row] = await sql`
    select pg_get_constraintdef(c.oid) as def, c.convalidated as validated
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'core' and c.conname = ${name}`;
  return row ? { def: row.def as string, validated: row.validated as boolean } : null;
}

async function indexExists(sql: postgres.Sql, name: string): Promise<boolean> {
  const [row] = await sql`select count(*)::int as n from pg_indexes where schemaname = 'core' and indexname = ${name}`;
  return row.n > 0;
}

type ReportRow = { kind: string; entity: string; entityId: string | null; value: string | null; detail: unknown };

async function report(sql: postgres.Sql): Promise<ReportRow[]> {
  const rows = await sql`
    select kind, entity, entity_id::text as entity_id, value, detail
    from core.project_flow_migration_report order by kind, value`;
  return rows.map((r) => ({
    kind: r.kind as string,
    entity: r.entity as string,
    entityId: (r.entity_id as string | null) ?? null,
    value: (r.value as string | null) ?? null,
    detail: typeof r.detail === "string" ? JSON.parse(r.detail) : r.detail,
  }));
}

/** Every catalog-owned row, so two snapshots can be compared for "nothing changed". */
async function catalogSnapshot(sql: postgres.Sql) {
  const [workflows, phases, templates, positions, positionPhases, statuses] = await Promise.all([
    sql`select id::text, key, name, deleted_at from core.workflows order by id`,
    sql`select id::text, workflow_id::text, key, name, sort_order, active from core.workflow_phases order by id`,
    sql`select id::text, workflow_id::text, phase_id::text, title, sort_order, active from core.workflow_task_templates order by id`,
    sql`select id::text, name, deleted_at from core.positions order by id`,
    sql`select position_id::text, phase_id::text from core.position_phases order by position_id, phase_id`,
    sql`select id::text, name, closes, counts_as_completed, deleted_at from core.task_statuses order by id`,
  ]);
  return { workflows, phases, templates, positions, positionPhases, statuses };
}

async function liveStatusesNamed(sql: postgres.Sql, name: string) {
  const rows = await sql`select id::text, name, closes, counts_as_completed from core.task_statuses where deleted_at is null`;
  return rows.filter((r) => flowNameKey(r.name as string) === flowNameKey(name));
}

// ---------------------------------------------------------------------------
// Fixture ids. Everything a test refers to has a fixed id.
// ---------------------------------------------------------------------------
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ID = {
  staff: id(1),
  client1: id(101),
  client2: id(102),
  presale: id(201),
  diseno: id(202),
  construccion: id(203),
  area: id(301),
  cancelado: id(401),
  enEspera: id(402),
  aprobado: id(403),
  legacyMinuta: id(501),
  madrid: id(601),
  dupA: id(602),
  dupB: id(603),
  dupC: id(604),
  sinTareas: id(605),
  guadalajara: id(606),
  t1: id(701),
  t2: id(702),
  t3: id(703),
  t4: id(704),
  t5: id(705),
  t6: id(706),
  t7: id(707),
  t8: id(708),
  t9: id(709),
  t10: id(710),
  t11: id(711),
  t12: id(712),
  roleMapping: id(801),
  areaMapping: id(802),
};

/** Shared base of both pre-0023 fixtures: staff, a client and the three tramos. */
const BASE_FIXTURE = `
insert into core.staff (id, name, email, role) values ('${ID.staff}', 'Ana Admin', 'ana@example.test', 'admin');
insert into core.contacts (id, type, name) values
  ('${ID.client1}', 'cliente', 'Cliente Uno'),
  ('${ID.client2}', 'cliente', 'Cliente Dos');
insert into core.workflows (id, key, name, sort_order) values
  ('${ID.presale}', 'presale', 'Presale', 0),
  ('${ID.diseno}', 'diseno', 'Taller de Diseño', 1),
  ('${ID.construccion}', 'construccion', 'Construcción', 2);
insert into core.workspace_group_mappings (id, group_email, group_id, kind, role)
  values ('${ID.roleMapping}', 'admins@example.test', 'g-role', 'role', 'admin');
`;

/**
 * Dev-like install (BE §16): a Madrid 22 with free-text fases, an old
 * "Iniciar plantilla" task, pre-existing Cancelado / En espera, soft-deleted
 * tasks, an área with a Google group mapping and duplicate project names.
 */
const DEV_FIXTURE = `
${BASE_FIXTURE}
insert into core.areas (id, name, lead_id, color_slot) values ('${ID.area}', 'Diseño', '${ID.staff}', 2);
insert into core.area_members (area_id, staff_id, role) values ('${ID.area}', '${ID.staff}', 'lead');
insert into core.area_workflows (area_id, workflow_id) values ('${ID.area}', '${ID.diseno}');
insert into core.workspace_group_mappings (id, group_email, group_id, kind, area_id)
  values ('${ID.areaMapping}', 'diseno@example.test', 'g-area', 'area', '${ID.area}');

insert into core.task_statuses (id, name, closes, sort_order) values
  ('${ID.cancelado}', 'Cancelado', true, 0),
  ('${ID.enEspera}', 'En espera', true, 1),
  ('${ID.aprobado}', 'Aprobado', true, 2);

-- A hand-typed template that the seed must reuse instead of duplicating.
insert into core.workflow_task_templates (id, workflow_id, phase, title, sort_order)
  values ('${ID.legacyMinuta}', '${ID.presale}', 'Minutas', 'Minuta', 0);

insert into core.projects (id, name, client_id, phases, created_at) values
  ('${ID.madrid}', 'Madrid 22', '${ID.client1}', '{Anteproyecto,Ejecutivo}', '2024-01-01T00:00:00Z'),
  ('${ID.dupA}', 'Casa X', '${ID.client1}', '{}', '2024-02-01T00:00:00Z'),
  ('${ID.dupB}', 'Casa X', '${ID.client2}', '{}', '2024-03-01T00:00:00Z'),
  ('${ID.dupC}', 'Casa X (2)', '${ID.client1}', '{}', '2024-01-15T00:00:00Z'),
  ('${ID.sinTareas}', 'Sin tareas', '${ID.client2}', '{}', '2024-04-01T00:00:00Z');
insert into core.projects (id, name, client_id, current_workflow_id, created_at)
  values ('${ID.guadalajara}', 'Guadalajara 83', '${ID.client2}', '${ID.construccion}', '2024-05-01T00:00:00Z');

-- Presale on Madrid 22: every live task completed, so the stage closes.
insert into core.tasks (id, project_id, kind, workflow_id, phase, title, created_by_id, status, created_at, updated_at) values
  ('${ID.t1}', '${ID.madrid}', 'usuario', '${ID.presale}', 'Presentacion', 'Llamada inicial', '${ID.staff}', 'completado',
    '2024-01-05T00:00:00Z', '2024-03-01T00:00:00Z'),
  ('${ID.t3}', '${ID.madrid}', 'usuario', '${ID.presale}', 'Presentación', 'Resporte Estado Actual', '${ID.staff}', 'completado',
    '2024-01-06T00:00:00Z', '2024-03-01T00:00:00Z');
insert into core.tasks (id, project_id, kind, template_id, workflow_id, title, created_by_id, status, created_at, updated_at) values
  ('${ID.t2}', '${ID.madrid}', 'workflow', '${ID.legacyMinuta}', '${ID.presale}', 'Minuta', '${ID.staff}', 'completado',
    '2024-01-07T00:00:00Z', '2024-02-12T00:00:00Z');
insert into core.tasks (id, project_id, kind, workflow_id, phase, title, created_by_id, status, created_at, deleted_at) values
  ('${ID.t4}', '${ID.madrid}', 'usuario', '${ID.presale}', 'Cobro', 'Cobro borrado', '${ID.staff}', 'pendiente',
    '2024-01-08T00:00:00Z', '2024-01-09T00:00:00Z');
insert into core.history_events (entity, entity_id, kind, actor_id, field, before_value, after_value, event_at) values
  ('task', '${ID.t1}', 'cambio', '${ID.staff}', 'status', 'en_proceso', 'completado', '2024-02-01T00:00:00Z'),
  ('task', '${ID.t1}', 'cambio', '${ID.staff}', 'status', 'en_proceso', 'completado', '2024-02-10T10:00:00Z'),
  ('task', '${ID.t3}', 'cambio', '${ID.staff}', 'status', 'pendiente', 'completado', '2024-02-11T00:00:00Z');

-- Diseño on Madrid 22: free-text fases, some open.
insert into core.tasks (id, project_id, kind, workflow_id, phase, title, created_by_id, status, custom_status_id, created_at, updated_at) values
  ('${ID.t5}', '${ID.madrid}', 'usuario', '${ID.diseno}', 'Proyecto Arquitectonico', 'Tarea 5', '${ID.staff}', 'pendiente', null,
    '2024-02-15T00:00:00Z', '2024-02-15T00:00:00Z'),
  ('${ID.t6}', '${ID.madrid}', 'usuario', '${ID.diseno}', 'Proyecto Ejecutivo', 'Tarea 6', '${ID.staff}', 'en_proceso', null,
    '2024-02-16T00:00:00Z', '2024-02-16T00:00:00Z'),
  ('${ID.t7}', '${ID.madrid}', 'usuario', '${ID.diseno}', 'Fase rara', 'Tarea 7', '${ID.staff}', 'pendiente', null,
    '2024-02-17T00:00:00Z', '2024-02-17T00:00:00Z'),
  ('${ID.t10}', '${ID.madrid}', 'usuario', '${ID.diseno}', 'Anteproyecto', 'Tarea 10', '${ID.staff}', 'completado', '${ID.cancelado}',
    '2024-02-18T00:00:00Z', '2024-02-20T00:00:00Z'),
  ('${ID.t11}', '${ID.madrid}', 'usuario', '${ID.diseno}', 'Anteproyecto', 'Tarea 11', '${ID.staff}', 'completado', '${ID.enEspera}',
    '2024-02-19T00:00:00Z', '2024-02-21T00:00:00Z'),
  ('${ID.t12}', '${ID.madrid}', 'usuario', '${ID.diseno}', 'Anteproyecto', 'Tarea 12', '${ID.staff}', 'completado', '${ID.aprobado}',
    '2024-02-19T00:00:00Z', '2024-02-22T00:00:00Z');

-- Usuario tasks without a tramo: one fase name is unique, "Minutas" is in two tramos.
insert into core.tasks (id, project_id, kind, phase, title, created_by_id, created_at) values
  ('${ID.t8}', '${ID.madrid}', 'usuario', 'Paisajismo', 'Tarea 8', '${ID.staff}', '2024-02-20T00:00:00Z'),
  ('${ID.t9}', '${ID.madrid}', 'usuario', 'Minutas', 'Tarea 9', '${ID.staff}', '2024-02-21T00:00:00Z');
`;

const canCreate = await canCreateDatabases();

describe.skipIf(!canCreate)("project flow migrations 0023 + 0024 (scratch databases)", () => {
  const scratches: Scratch[] = [];

  afterAll(async () => {
    for (const s of scratches) await dropScratch(s);
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  }, 60_000);

  async function scratch(label: string) {
    const s = await createScratch(label);
    scratches.push(s);
    return s.sql;
  }

  describe("fresh install, then ensureDefaultCatalog", () => {
    let sql: postgres.Sql;

    beforeAll(async () => {
      sql = await scratch("fresh");
      await migrateTo(sql, "0024");
      // What scripts/migrate.mjs does after the migrator.
      await ensureDefaultWorkflows(sql);
      await ensureDefaultCatalog(sql);
    }, 120_000);

    it("ends with the final group_mapping_kind enum and check, and a validated closed_at check", async () => {
      expect(await groupMappingKinds(sql)).toEqual(["role", "position"]);
      const kindCheck = await constraintDef(sql, "workspace_group_mappings_kind_check");
      expect(kindCheck?.def).toContain("position");
      expect(kindCheck?.def).not.toContain("area");
      expect((await constraintDef(sql, "tasks_closed_at_check"))?.validated).toBe(true);
      expect(await indexExists(sql, "projects_name_lower_uq")).toBe(true);
      expect(await indexExists(sql, "projects_client_name_lower_uq")).toBe(false);
    });

    it("seeds 14 fases, 51 templates with a fase, the six puestos with candidates and both statuses", async () => {
      const [{ n: phases }] = await sql`select count(*)::int as n from core.workflow_phases`;
      expect(phases).toBe(14);
      const perTramo = await sql`
        select w.key, count(t.id)::int as n, count(t.phase_id)::int as with_phase
        from core.workflows w left join core.workflow_task_templates t on t.workflow_id = w.id
        group by w.key order by w.key`;
      expect(perTramo.map((r) => [r.key, r.n, r.with_phase])).toEqual([
        ["construccion", 12, 12],
        ["diseno", 29, 29],
        ["presale", 10, 10],
      ]);

      const positions = await sql`
        select p.name, count(pp.phase_id)::int as candidates
        from core.positions p left join core.position_phases pp on pp.position_id = p.id
        where p.deleted_at is null group by p.name order by p.name`;
      expect(positions).toHaveLength(6);
      expect(positions.every((p) => p.candidates > 0)).toBe(true);

      expect(await liveStatusesNamed(sql, "Cancelado")).toEqual([
        expect.objectContaining({ closes: true, counts_as_completed: false }),
      ]);
      expect(await liveStatusesNamed(sql, "En espera")).toEqual([
        expect.objectContaining({ closes: false, counts_as_completed: false }),
      ]);
    });

    it("changes nothing when run a second time", async () => {
      const before = await catalogSnapshot(sql);
      await ensureDefaultCatalog(sql);
      expect(await catalogSnapshot(sql)).toEqual(before);
    });

    it("doesn't bring back a soft-deleted status or puesto", async () => {
      await sql`update core.task_statuses set deleted_at = now() where name = 'En espera' and deleted_at is null`;
      await sql`update core.positions set deleted_at = now() where name = 'Dibujante' and deleted_at is null`;
      const before = await catalogSnapshot(sql);

      await ensureDefaultCatalog(sql);
      await ensureDefaultCatalog(sql);

      expect(await catalogSnapshot(sql)).toEqual(before);
      expect(await liveStatusesNamed(sql, "En espera")).toEqual([]);
      const [{ n }] = await sql`select count(*)::int as n from core.positions where name = 'Dibujante' and deleted_at is null`;
      expect(n).toBe(0);
    });

    describe("constraints", () => {
      async function seedProjects(tx: postgres.TransactionSql) {
        await tx`insert into core.staff (id, name) values (${ID.staff}, 'Ana Admin')`;
        await tx`insert into core.contacts (id, type, name) values (${ID.client1}, 'cliente', 'Cliente Uno')`;
        await tx`insert into core.projects (id, name, client_id) values (${ID.madrid}, 'Madrid 22', ${ID.client1})`;
        await tx`insert into core.projects (id, name) values (${ID.dupA}, 'Otro proyecto')`;
        const phases = await tx`
          select p.id::text, p.key, w.id::text as workflow_id, w.key as workflow_key
          from core.workflow_phases p join core.workflows w on w.id = p.workflow_id`;
        const phase = (workflowKey: string, key: string) => {
          const row = phases.find((p) => p.workflow_key === workflowKey && p.key === key);
          if (!row) throw new Error(`fase ${workflowKey}.${key} missing`);
          return { id: row.id as string, workflowId: row.workflow_id as string };
        };
        return { phase };
      }

      it("refuses a task with a fase of another tramo (tasks_phase_fk)", async () => {
        await inRollback(sql, async (tx) => {
          const { phase } = await seedProjects(tx);
          const cobro = phase("presale", "cobro");
          const diseno = phase("diseno", "ejecutivo").workflowId;
          expect(
            await violated(
              tx,
              (sp) => sp`
                insert into core.tasks (project_id, kind, workflow_id, phase_id, title, created_by_id)
                values (${ID.madrid}, 'usuario', ${diseno}, ${cobro.id}, 'Cruzada', ${ID.staff})`
            )
          ).toBe("tasks_phase_fk");
          // Same fase with its own tramo is fine.
          expect(
            await violated(
              tx,
              (sp) => sp`
                insert into core.tasks (project_id, kind, workflow_id, phase_id, title, created_by_id)
                values (${ID.madrid}, 'usuario', ${cobro.workflowId}, ${cobro.id}, 'Correcta', ${ID.staff})`
            )
          ).toBeNull();
        });
      });

      it("refuses a fase without a tramo", async () => {
        await inRollback(sql, async (tx) => {
          const { phase } = await seedProjects(tx);
          expect(
            await violated(
              tx,
              (sp) => sp`
                insert into core.tasks (project_id, kind, phase_id, title, created_by_id)
                values (${ID.madrid}, 'usuario', ${phase("presale", "cobro").id}, 'Sin tramo', ${ID.staff})`
            )
          ).toBe("tasks_phase_needs_workflow_check");
        });
      });

      it("refuses an admin task with a tramo, a fase or an espacio", async () => {
        await inRollback(sql, async (tx) => {
          const { phase } = await seedProjects(tx);
          const cobro = phase("presale", "cobro");
          const [space] = await tx`
            insert into core.project_spaces (project_id, name) values (${ID.madrid}, 'Cocina') returning id::text`;
          const admin = (sp: postgres.TransactionSql, workflowId: string | null, phaseId: string | null, spaceId: string | null) =>
            sp`insert into core.tasks (project_id, kind, workflow_id, phase_id, space_id, title, created_by_id)
               values (${ID.madrid}, 'admin', ${workflowId}, ${phaseId}, ${spaceId}, 'Asignar cliente y origen', ${ID.staff})`;
          expect(await violated(tx, (sp) => admin(sp, cobro.workflowId, null, null))).toBe("tasks_kind_check");
          expect(await violated(tx, (sp) => admin(sp, cobro.workflowId, cobro.id, null))).toBe("tasks_kind_check");
          expect(await violated(tx, (sp) => admin(sp, null, null, space.id))).toBe("tasks_kind_check");
          expect(await violated(tx, (sp) => admin(sp, null, null, null))).toBeNull();
        });
      });

      it("refuses an espacio of another project (tasks_space_fk)", async () => {
        await inRollback(sql, async (tx) => {
          await seedProjects(tx);
          const [space] = await tx`
            insert into core.project_spaces (project_id, name) values (${ID.dupA}, 'Baño') returning id::text`;
          expect(
            await violated(
              tx,
              (sp) => sp`
                insert into core.tasks (project_id, kind, space_id, title, created_by_id)
                values (${ID.madrid}, 'usuario', ${space.id}, 'Espacio ajeno', ${ID.staff})`
            )
          ).toBe("tasks_space_fk");
        });
      });

      it("refuses counts_as_completed without closes", async () => {
        await inRollback(sql, async (tx) => {
          expect(
            await violated(
              tx,
              (sp) => sp`insert into core.task_statuses (name, closes, counts_as_completed) values ('Raro', false, true)`
            )
          ).toBe("task_statuses_counts_check");
        });
      });

      it("refuses closed_at on an open task", async () => {
        await inRollback(sql, async (tx) => {
          await seedProjects(tx);
          expect(
            await violated(
              tx,
              (sp) => sp`
                insert into core.tasks (project_id, kind, title, created_by_id, status, closed_at)
                values (${ID.madrid}, 'usuario', 'Abierta', ${ID.staff}, 'pendiente', now())`
            )
          ).toBe("tasks_closed_at_check");
        });
      });

      it("refuses duplicate names among active projects but allows one against a completed project", async () => {
        await inRollback(sql, async (tx) => {
          await seedProjects(tx);
          expect(
            await violated(tx, (sp) => sp`insert into core.projects (name) values ('MADRID 22')`)
          ).toBe("projects_name_lower_uq");
          await tx`update core.projects set status = 'completado' where id = ${ID.madrid}`;
          expect(await violated(tx, (sp) => sp`insert into core.projects (name) values ('Madrid 22')`)).toBeNull();
        });
      });

      it("refuses a position mapping without a puesto and a role mapping with one", async () => {
        await inRollback(sql, async (tx) => {
          const [position] = await tx`select id::text from core.positions where deleted_at is null limit 1`;
          expect(
            await violated(
              tx,
              (sp) => sp`
                insert into core.workspace_group_mappings (group_email, group_id, kind)
                values ('x@example.test', 'g-x', 'position')`
            )
          ).toBe("workspace_group_mappings_kind_check");
          expect(
            await violated(
              tx,
              (sp) => sp`
                insert into core.workspace_group_mappings (group_email, group_id, kind, role, position_id)
                values ('y@example.test', 'g-y', 'role', 'admin', ${position.id})`
            )
          ).toBe("workspace_group_mappings_kind_check");
          expect(
            await violated(
              tx,
              (sp) => sp`
                insert into core.workspace_group_mappings (group_email, group_id, kind, position_id)
                values ('z@example.test', 'g-z', 'position', ${position.id})`
            )
          ).toBeNull();
        });
      });
    });
  });

  describe("existing install without an área mapping", () => {
    let sql: postgres.Sql;

    beforeAll(async () => {
      sql = await scratch("noarea");
      await migrateTo(sql, "0022");
      await sql.unsafe(BASE_FIXTURE);
      await migrateTo(sql, "0024");
    }, 120_000);

    it("applies and ends with the final enum and check", async () => {
      expect(await groupMappingKinds(sql)).toEqual(["role", "position"]);
      const kindCheck = await constraintDef(sql, "workspace_group_mappings_kind_check");
      expect(kindCheck?.def).toContain("position");
      expect(kindCheck?.def).not.toContain("area");
    });

    it("keeps the role mapping and reports no removed mapping", async () => {
      const mappings = await sql`select id::text, kind::text as kind, role from core.workspace_group_mappings`;
      expect(mappings).toEqual([{ id: ID.roleMapping, kind: "role", role: "admin" }]);
      expect((await report(sql)).filter((r) => r.kind === "group_mapping_area_removed")).toEqual([]);
    });

    it("seeds the catalog onto the existing tramos and creates Cancelado and En espera once", async () => {
      const [{ n }] = await sql`select count(*)::int as n from core.workflow_phases`;
      expect(n).toBe(14);
      const [{ t, nophase }] = await sql`
        select count(*)::int as t, count(*) filter (where phase_id is null)::int as nophase
        from core.workflow_task_templates`;
      expect([t, nophase]).toEqual([51, 0]);
      expect(await liveStatusesNamed(sql, "Cancelado")).toHaveLength(1);
      expect(await liveStatusesNamed(sql, "En espera")).toHaveLength(1);
      expect((await report(sql)).filter((r) => r.kind === "status_created")).toHaveLength(2);
    });

    it("then ensureDefaultCatalog changes nothing", async () => {
      const before = await catalogSnapshot(sql);
      await ensureDefaultCatalog(sql);
      expect(await catalogSnapshot(sql)).toEqual(before);
    });
  });

  describe("dev-like install with an área mapping", () => {
    let sql: postgres.Sql;
    let rows: ReportRow[];

    const phaseOf = async (taskId: string) => {
      const [row] = await sql`
        select t.kind::text as kind, t.title, t.template_id::text as template_id, t.status::text as status,
               t.closed_at, w.key as workflow_key, p.key as phase_key
        from core.tasks t
        left join core.workflows w on w.id = t.workflow_id
        left join core.workflow_phases p on p.id = t.phase_id
        where t.id = ${taskId}`;
      return row;
    };

    beforeAll(async () => {
      sql = await scratch("dev");
      await migrateTo(sql, "0022");
      await sql.unsafe(DEV_FIXTURE);
      await migrateTo(sql, "0024");
      rows = await report(sql);
    }, 120_000);

    it("renames the Diseño tramo and turns on Presale auto-start", async () => {
      const workflows = await sql`select key, name, auto_start::text as auto_start from core.workflows order by sort_order`;
      expect(workflows.map((w) => [w.key, w.name, w.auto_start])).toEqual([
        ["presale", "Presale", "on_create"],
        ["diseno", "Diseño", "manual"],
        ["construccion", "Construcción", "manual"],
      ]);
    });

    it("reuses the hand-typed template instead of seeding a second Minuta", async () => {
      const presale = await sql`
        select t.id::text, t.title, p.key as phase_key from core.workflow_task_templates t
        left join core.workflow_phases p on p.id = t.phase_id
        where t.workflow_id = ${ID.presale}`;
      expect(presale).toHaveLength(10);
      expect(presale.filter((t) => flowNameKey(t.title as string) === "minuta")).toEqual([
        { id: ID.legacyMinuta, title: "Minuta", phase_key: "minutas" },
      ]);
      const [{ nophase }] = await sql`
        select count(*) filter (where phase_id is null)::int as nophase from core.workflow_task_templates`;
      expect(nophase).toBe(0);
    });

    it("normalizes free-text fases accent-insensitively, including deleted tasks", async () => {
      expect(await phaseOf(ID.t1)).toMatchObject({ workflow_key: "presale", phase_key: "presentacion" });
      expect(await phaseOf(ID.t2)).toMatchObject({ workflow_key: "presale", phase_key: "minutas" });
      expect(await phaseOf(ID.t4)).toMatchObject({ workflow_key: "presale", phase_key: "cobro" });
      expect(await phaseOf(ID.t5)).toMatchObject({ workflow_key: "diseno", phase_key: "proyecto_arquitectonico" });
      expect(await phaseOf(ID.t6)).toMatchObject({ workflow_key: "diseno", phase_key: "ejecutivo" });
    });

    it("leaves unmatched fases empty and reports them", async () => {
      expect(await phaseOf(ID.t7)).toMatchObject({ workflow_key: "diseno", phase_key: null });
      expect(await phaseOf(ID.t9)).toMatchObject({ workflow_key: null, phase_key: null });
      const unmatched = rows.filter((r) => r.kind === "task_phase_unmatched");
      expect(unmatched.map((r) => [r.entityId, r.value]).sort()).toEqual(
        [
          [ID.t7, "Fase rara"],
          [ID.t9, "Minutas"],
        ].sort()
      );
    });

    it("infers the tramo when the fase name exists in only one", async () => {
      expect(await phaseOf(ID.t8)).toMatchObject({ workflow_key: "diseno", phase_key: "paisajismo" });
      expect(rows.filter((r) => r.kind === "task_tramo_inferred").map((r) => r.entityId)).toEqual([ID.t8]);
    });

    it("links the old Iniciar plantilla task to its seeded template without renaming it", async () => {
      const [template] = await sql`
        select id::text from core.workflow_task_templates
        where workflow_id = ${ID.presale} and title = 'Reporte Estado Actual'`;
      expect(await phaseOf(ID.t3)).toMatchObject({
        kind: "workflow",
        title: "Resporte Estado Actual",
        template_id: template.id,
        phase_key: "presentacion",
      });
      expect(rows.filter((r) => r.kind === "task_linked_to_template").map((r) => r.entityId)).toEqual([ID.t3]);
    });

    it("reuses Cancelado and En espera once each and re-syncs their tasks", async () => {
      expect(await liveStatusesNamed(sql, "Cancelado")).toEqual([
        { id: ID.cancelado, name: "Cancelado", closes: true, counts_as_completed: false },
      ]);
      expect(await liveStatusesNamed(sql, "En espera")).toEqual([
        { id: ID.enEspera, name: "En espera", closes: false, counts_as_completed: false },
      ]);
      expect(await liveStatusesNamed(sql, "Aprobado")).toEqual([
        { id: ID.aprobado, name: "Aprobado", closes: true, counts_as_completed: true },
      ]);

      expect(await phaseOf(ID.t10)).toMatchObject({ status: "completado" });
      expect((await phaseOf(ID.t10)).closed_at).not.toBeNull();
      expect(await phaseOf(ID.t11)).toMatchObject({ status: "en_proceso", closed_at: null });

      const reused = rows.filter((r) => r.kind === "status_reused");
      expect(reused).toHaveLength(2);
      const enEspera = reused.find((r) => flowNameKey(String((r.detail as { name?: string })?.name ?? "")) === "enespera");
      expect(enEspera?.detail).toMatchObject({ tasksReopened: 1 });
      expect(rows.filter((r) => r.kind === "status_created")).toEqual([]);
    });

    it("backfills closed_at from the latest status change, else updated_at", async () => {
      expect(new Date((await phaseOf(ID.t1)).closed_at).toISOString()).toBe("2024-02-10T10:00:00.000Z");
      expect(new Date((await phaseOf(ID.t3)).closed_at).toISOString()).toBe("2024-02-11T00:00:00.000Z");
      expect(new Date((await phaseOf(ID.t2)).closed_at).toISOString()).toBe("2024-02-12T00:00:00.000Z");
      expect((await phaseOf(ID.t5)).closed_at).toBeNull();
      expect((await constraintDef(sql, "tasks_closed_at_check"))?.validated).toBe(true);
    });

    it("writes stages with started_at and closes the tramo whose tasks are all closed", async () => {
      const stages = await sql`
        select w.key, s.started_at, s.closed_at from core.project_stages s
        join core.workflows w on w.id = s.workflow_id
        where s.project_id = ${ID.madrid} order by w.sort_order`;
      expect(stages.map((s) => s.key)).toEqual(["presale", "diseno"]);
      const [presale, diseno] = stages;
      expect(new Date(presale.started_at).toISOString()).toBe("2024-01-05T00:00:00.000Z");
      expect(new Date(presale.closed_at).toISOString()).toBe("2024-02-12T00:00:00.000Z");
      expect(diseno.closed_at).toBeNull();
    });

    it("sets the current tramo from the stages and keeps an existing one with its stage", async () => {
      const projects = await sql`
        select p.id::text, w.key as current from core.projects p
        left join core.workflows w on w.id = p.current_workflow_id`;
      const current = Object.fromEntries(projects.map((p) => [p.id, p.current]));
      expect(current[ID.madrid]).toBe("diseno");
      expect(current[ID.guadalajara]).toBe("construccion");
      expect(current[ID.sinTareas]).toBeNull();

      const [{ n }] = await sql`
        select count(*)::int as n from core.project_stages
        where project_id = ${ID.guadalajara} and workflow_id = ${ID.construccion}`;
      expect(n).toBe(1);
      expect(rows.filter((r) => r.kind === "project_without_tramo").map((r) => r.entityId)).toContain(ID.sinTareas);
      expect(rows.filter((r) => r.kind === "project_without_tramo").map((r) => r.entityId)).not.toContain(ID.guadalajara);
    });

    it("reports projects.phases", async () => {
      expect(rows.filter((r) => r.kind === "project_phases").map((r) => [r.entityId, r.value])).toEqual([
        [ID.madrid, "Anteproyecto · Ejecutivo"],
      ]);
    });

    it("deduplicates names to the first free suffix and swaps the unique index", async () => {
      const names = await sql`select id::text, name from core.projects where id in ${sql([ID.dupA, ID.dupB, ID.dupC])}`;
      expect(Object.fromEntries(names.map((p) => [p.id, p.name]))).toEqual({
        [ID.dupA]: "Casa X",
        [ID.dupB]: "Casa X (3)",
        [ID.dupC]: "Casa X (2)",
      });
      const renamed = rows.filter((r) => r.kind === "project_renamed_duplicate");
      expect(renamed).toHaveLength(1);
      expect(renamed[0]).toMatchObject({ entityId: ID.dupB, detail: { before: "Casa X", after: "Casa X (3)" } });
      expect(await indexExists(sql, "projects_name_lower_uq")).toBe(true);
      expect(await indexExists(sql, "projects_client_name_lower_uq")).toBe(false);
    });

    it("reports the área data and removes the área mapping before renaming the enum", async () => {
      expect(rows.filter((r) => r.kind === "area").map((r) => r.entityId)).toEqual([ID.area]);
      expect(rows.filter((r) => r.kind === "area_member")).toHaveLength(1);
      expect(rows.filter((r) => r.kind === "area_member")[0].detail).toMatchObject({ role: "lead" });
      expect(rows.filter((r) => r.kind === "area_workflow")).toHaveLength(1);

      const removed = rows.filter((r) => r.kind === "group_mapping_area_removed");
      expect(removed).toHaveLength(1);
      expect(removed[0].detail).toMatchObject({ groupEmail: "diseno@example.test", areaName: "Diseño" });

      const mappings = await sql`select id::text, kind::text as kind from core.workspace_group_mappings`;
      expect(mappings).toEqual([{ id: ID.roleMapping, kind: "role" }]);
      expect(await groupMappingKinds(sql)).toEqual(["role", "position"]);
    });

    it("seeds the puestos with their candidate fases", async () => {
      const positions = await sql`
        select p.name, count(pp.phase_id)::int as candidates
        from core.positions p left join core.position_phases pp on pp.position_id = p.id
        where p.deleted_at is null group by p.name`;
      expect(positions).toHaveLength(6);
      expect(positions.find((p) => p.name === "Dibujante")?.candidates).toBe(2);
      expect(positions.every((p) => p.candidates > 0)).toBe(true);
    });

    it("then ensureDefaultCatalog changes nothing", async () => {
      const before = await catalogSnapshot(sql);
      await ensureDefaultCatalog(sql);
      expect(await catalogSnapshot(sql)).toEqual(before);
    });
  });
});
