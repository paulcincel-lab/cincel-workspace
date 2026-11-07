// @vitest-environment node
/**
 * 0023 + 0024 on fresh scratch databases, BE §4.2 steps 1–8: tramo rows, the fase catalog, the 51
 * seed templates, template and task fase backfill (incl. 5e template linking), the projects.phases
 * report, Cancelado / En espera reused or created, and tasks.closed_at. Also an empty database
 * (fresh install) and a second run of 0024.
 * Runs only when TEST_DATABASE_URL points at a Postgres whose user may create databases.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const migrationsDir = join(__dirname);
const BACKFILL = "0024_project_flow_backfill";

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
  return journal.entries
    .filter((e) => e.idx < idx)
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.tag);
}

async function applyInOneTransaction(sql: postgres.Sql, tags: string[]) {
  await sql.begin(async (tx) => {
    for (const tag of tags) {
      for (const statement of statementsOf(tag)) await tx.unsafe(statement);
    }
  });
}

type ScratchDb = { sql: postgres.Sql; drop: () => Promise<void> };

/** A new empty database, migrated up to 0022 (before project flow). */
async function scratchDatabase(): Promise<ScratchDb> {
  const admin = postgres(url!, { max: 1, onnotice: () => {} });
  const dbName = `cincel_pf1_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  await admin.unsafe(`create database "${dbName}"`);
  const target = new URL(url!);
  target.pathname = `/${dbName}`;
  const sql = postgres(target.toString(), { max: 1, onnotice: () => {} });
  await applyInOneTransaction(sql, tagsBefore(23));
  return {
    sql,
    drop: async () => {
      await sql.end();
      await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
      await admin.end();
    },
  };
}

async function reportRows(sql: postgres.Sql, kind: string) {
  return sql`
    select entity, entity_id, value, detail from core.project_flow_migration_report
    where kind = ${kind} order by value`;
}

describe.skipIf(!url)("0024 steps 1–8 on a dev-like scratch database", () => {
  let db: ScratchDb;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await scratchDatabase();
    const { sql } = db;

    const [staffRow] = await sql`insert into core.staff (name) values ('Ana Prueba') returning id`;
    ids.staff = staffRow.id;
    const [client] = await sql`insert into core.contacts (type, name) values ('cliente', 'Cliente Prueba') returning id`;
    ids.client = client.id;

    const workflow = async (key: string, name: string, sortOrder: number) => {
      const [row] = await sql`
        insert into core.workflows (key, name, sort_order) values (${key}, ${name}, ${sortOrder}) returning id`;
      return row.id as string;
    };
    ids.presale = await workflow("presale", "Presale", 0);
    ids.diseno = await workflow("diseno", "Diseno", 1);
    ids.construccion = await workflow("construccion", "Construcción", 2);

    // A hand-made template with the old spelling blocks its seed row and gets the seed's fase.
    const [old] = await sql`
      insert into core.workflow_task_templates (workflow_id, phase, title, sort_order)
      values (${ids.diseno}, 'Proyecto Arquitectonico', 'Planos Arquitectonicos', 0) returning id`;
    ids.oldTemplate = old.id;
    // A template whose fase text matches nothing goes to the tramo's first fase.
    const [stray] = await sql`
      insert into core.workflow_task_templates (workflow_id, phase, title, sort_order)
      values (${ids.presale}, 'Otra cosa', 'Tarea vieja', 1) returning id`;
    ids.strayTemplate = stray.id;

    const [project] = await sql`
      insert into core.projects (name, client_id, phases) values ('Madrid 22', ${ids.client}, '{Anteproyecto,Obra}')
      returning id`;
    ids.project = project.id;

    // Statuses as they were before project flow.
    const status = async (name: string, closes: boolean, sortOrder: number) => {
      const [row] = await sql`
        insert into core.task_statuses (name, closes, sort_order) values (${name}, ${closes}, ${sortOrder}) returning id`;
      return row.id as string;
    };
    ids.revisado = await status("Revisado", true, 0);
    ids.cancelado = await status("Cancelado", true, 1);
    ids.enEspera = await status("En espera", true, 2);

    const task = async (t: {
      title: string;
      workflowId?: string | null;
      phase?: string | null;
      status?: string;
      customStatusId?: string | null;
      createdAt?: string;
    }) => {
      const createdAt = t.createdAt ?? "2026-01-10";
      const [row] = await sql`
        insert into core.tasks
          (project_id, kind, workflow_id, phase, title, status, custom_status_id, created_by_id, created_at, updated_at)
        values (${ids.project}, 'usuario', ${t.workflowId ?? null}, ${t.phase ?? null}, ${t.title},
                ${t.status ?? "pendiente"}::core.task_status, ${t.customStatusId ?? null}, ${ids.staff},
                ${createdAt}::timestamptz, ${createdAt}::timestamptz)
        returning id`;
      return row.id as string;
    };
    // Old "Iniciar plantilla" tasks: TS spelling; the first one wins the template slot.
    ids.linked = await task({ title: "Resporte Estado Actual", workflowId: ids.presale, phase: "Presentación", createdAt: "2026-01-01" });
    ids.notLinked = await task({ title: "Resporte Estado Actual", workflowId: ids.presale, phase: "Presentacion", createdAt: "2026-01-02" });
    ids.linkedNoPhase = await task({ title: "Planos de Albanilerias", workflowId: ids.diseno });
    ids.alias = await task({ title: "Cosa X", workflowId: ids.diseno, phase: "Proyecto Ejecutivo" });
    ids.inferred = await task({ title: "Paleta", phase: "Paisajismo" });
    ids.ambiguous = await task({ title: "Junta", phase: "Minutas" });
    ids.unmatched = await task({ title: "Algo raro", workflowId: ids.diseno, phase: "Fase rara" });
    ids.postventa = await task({ title: "Revisión final", workflowId: ids.construccion, phase: "Post - Venta", status: "completado" });
    ids.completedNoHistory = await task({ title: "Sin historia", workflowId: ids.construccion, phase: "Residencia", status: "completado", createdAt: "2026-02-15" });
    ids.cancelled = await task({ title: "Cancelada", workflowId: ids.construccion, status: "en_proceso", customStatusId: ids.cancelado });
    ids.waiting = await task({ title: "Esperando", workflowId: ids.construccion, status: "completado", customStatusId: ids.enEspera });
    ids.reviewed = await task({ title: "Revisada", workflowId: ids.construccion, status: "completado", customStatusId: ids.revisado });

    const history = async (taskId: string, field: string, after: string, at: string) => {
      await sql`
        insert into core.history_events (entity, entity_id, kind, actor_id, field, after_value, event_at)
        values ('task', ${taskId}, 'cambio', ${ids.staff}, ${field}, ${after}, ${at}::timestamptz)`;
    };
    await history(ids.postventa, "status", "completado", "2026-03-01T10:00:00Z");
    await history(ids.postventa, "status", "en_proceso", "2026-03-02T10:00:00Z");
    await history(ids.postventa, "status", "completado", "2026-04-01T10:00:00Z");
    await history(ids.reviewed, "customStatusId", ids.revisado, "2026-05-01T10:00:00Z");

    await applyInOneTransaction(sql, ["0023_project_flow_schema", BACKFILL]);
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  const taskRow = async (id: string) => {
    const [row] = await db.sql`
      select t.kind::text as kind, t.workflow_id, t.template_id, t.title, t.status::text as status, t.closed_at,
             p.key as phase_key
      from core.tasks t left join core.workflow_phases p on p.id = t.phase_id
      where t.id = ${id}`;
    return row;
  };

  it("updates the tramo rows", async () => {
    const rows = await db.sql`
      select key, name, description, auto_start::text as auto_start from core.workflows order by sort_order`;
    expect(rows.map((r) => [r.key, r.name, r.auto_start])).toEqual([
      ["presale", "Presale", "on_create"],
      ["diseno", "Diseño", "manual"],
      ["construccion", "Construcción", "manual"],
    ]);
    expect(rows[0].description).toBe("Flujo de prospección, presentación y cierre.");
    expect(rows[2].description).toBe("Flujo de residencia de obra y postventa.");
  });

  it("seeds the 14 fases in order", async () => {
    const rows = await db.sql`
      select w.key as workflow_key, p.key, p.name, p.sort_order
      from core.workflow_phases p join core.workflows w on w.id = p.workflow_id
      order by w.sort_order, p.sort_order`;
    expect(rows).toHaveLength(14);
    expect(rows.filter((r) => r.workflow_key === "presale").map((r) => r.key)).toEqual([
      "inicial",
      "presentacion",
      "con_cliente",
      "minutas",
      "cobro",
    ]);
    expect(rows.filter((r) => r.workflow_key === "diseno").map((r) => r.name)).toEqual([
      "Anteproyecto",
      "Proyecto Arquitectónico",
      "Ejecutivo",
      "Proyecto Estructural",
      "Proyecto Sustentable",
      "Paisajismo",
      "Minutas",
    ]);
    expect(rows.filter((r) => r.workflow_key === "construccion").map((r) => r.key)).toEqual(["residencia", "postventa"]);
  });

  it("seeds the templates, every one with a fase, without duplicating a hand-made one", async () => {
    const rows = await db.sql`
      select w.key as workflow_key, p.key as phase_key, t.id, t.title
      from core.workflow_task_templates t
      join core.workflows w on w.id = t.workflow_id
      left join core.workflow_phases p on p.id = t.phase_id`;
    expect(rows.filter((r) => r.phase_key == null)).toEqual([]);
    // 51 seed rows, less the one the hand-made "Planos Arquitectonicos" replaces, plus the two hand-made ones.
    expect(rows).toHaveLength(52);
    const count = (key: string) => rows.filter((r) => r.workflow_key === key).length;
    expect([count("presale"), count("diseno"), count("construccion")]).toEqual([11, 29, 12]);

    const planos = rows.filter((r) => r.workflow_key === "diseno" && r.title.startsWith("Planos Arquitect"));
    expect(planos).toEqual([
      expect.objectContaining({ id: ids.oldTemplate, phase_key: "proyecto_arquitectonico" }),
    ]);
    const fachadas = rows.filter((r) => r.title === "Fachadas y alzados").map((r) => r.phase_key).sort();
    expect(fachadas).toEqual(["ejecutivo", "proyecto_arquitectonico"]);
    const garantias = rows.filter((r) => r.title === "Garantías").map((r) => r.phase_key).sort();
    expect(garantias).toEqual(["postventa", "residencia"]);

    const stray = rows.find((r) => r.id === ids.strayTemplate);
    expect(stray?.phase_key).toBe("inicial");
    const defaulted = await reportRows(db.sql, "template_phase_defaulted");
    expect(defaulted).toHaveLength(1);
    expect(defaulted[0]).toMatchObject({ entity: "template", entity_id: ids.strayTemplate, value: "Otra cosa" });
  });

  it("matches task fases accent-insensitively, with the Proyecto Ejecutivo alias", async () => {
    expect((await taskRow(ids.notLinked)).phase_key).toBe("presentacion");
    expect((await taskRow(ids.alias)).phase_key).toBe("ejecutivo");
    expect((await taskRow(ids.postventa)).phase_key).toBe("postventa");
  });

  it("infers the tramo of a task whose fase exists in one tramo only", async () => {
    const inferred = await taskRow(ids.inferred);
    expect(inferred.workflow_id).toBe(ids.diseno);
    expect(inferred.phase_key).toBe("paisajismo");
    const rows = await reportRows(db.sql, "task_tramo_inferred");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity_id: ids.inferred, value: "Paisajismo" });
    expect(rows[0].detail).toEqual({ projectId: ids.project, workflowKey: "diseno" });
  });

  it("keeps unmatched fases null and reports them", async () => {
    const ambiguous = await taskRow(ids.ambiguous);
    expect(ambiguous.workflow_id).toBeNull();
    expect(ambiguous.phase_key).toBeNull();
    expect((await taskRow(ids.unmatched)).phase_key).toBeNull();

    const rows = await reportRows(db.sql, "task_phase_unmatched");
    expect(rows.map((r) => r.entity_id).sort()).toEqual([ids.ambiguous, ids.unmatched].sort());
    const unmatched = rows.find((r) => r.entity_id === ids.unmatched)!;
    expect(unmatched.value).toBe("Fase rara");
    expect(unmatched.detail).toEqual({ projectId: ids.project, workflowKey: "diseno" });
    const ambiguousRow = rows.find((r) => r.entity_id === ids.ambiguous)!;
    expect(ambiguousRow.detail).toEqual({ projectId: ids.project, workflowKey: null });
  });

  it("links old template tasks to their seeded template, first one per slot", async () => {
    const linked = await taskRow(ids.linked);
    expect(linked.kind).toBe("workflow");
    expect(linked.template_id).not.toBeNull();
    expect(linked.phase_key).toBe("presentacion");
    expect(linked.title).toBe("Resporte Estado Actual");
    const [template] = await db.sql`select title from core.workflow_task_templates where id = ${linked.template_id}`;
    expect(template.title).toBe("Reporte Estado Actual");

    const notLinked = await taskRow(ids.notLinked);
    expect(notLinked.kind).toBe("usuario");
    expect(notLinked.template_id).toBeNull();

    const noPhase = await taskRow(ids.linkedNoPhase);
    expect(noPhase.kind).toBe("workflow");
    expect(noPhase.phase_key).toBe("ejecutivo");

    const rows = await reportRows(db.sql, "task_linked_to_template");
    expect(rows.map((r) => r.entity_id).sort()).toEqual([ids.linked, ids.linkedNoPhase].sort());
  });

  it("reports projects.phases", async () => {
    const rows = await reportRows(db.sql, "project_phases");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "project", entity_id: ids.project, value: "Anteproyecto · Obra" });
  });

  it("reuses Cancelado and En espera once each and re-syncs their tasks", async () => {
    const statuses = await db.sql`
      select id, name, closes, counts_as_completed from core.task_statuses where deleted_at is null order by sort_order`;
    expect(statuses.map((s) => [s.name, s.closes, s.counts_as_completed])).toEqual([
      ["Revisado", true, true],
      ["Cancelado", true, false],
      ["En espera", false, false],
    ]);
    expect(await reportRows(db.sql, "status_created")).toHaveLength(0);

    const reused = await reportRows(db.sql, "status_reused");
    expect(reused.map((r) => r.entity_id).sort()).toEqual([ids.cancelado, ids.enEspera].sort());
    const cancelado = reused.find((r) => r.entity_id === ids.cancelado)!;
    expect(cancelado.detail).toEqual({
      name: "Cancelado",
      before: { closes: true, countsAsCompleted: true },
      after: { closes: true, countsAsCompleted: false },
      tasksResynced: 1,
      tasksReopened: 0,
    });
    const enEspera = reused.find((r) => r.entity_id === ids.enEspera)!;
    expect(enEspera.detail).toEqual({
      name: "En espera",
      before: { closes: true, countsAsCompleted: true },
      after: { closes: false, countsAsCompleted: false },
      tasksResynced: 1,
      tasksReopened: 1,
    });

    const cancelled = await taskRow(ids.cancelled);
    expect(cancelled.status).toBe("completado");
    expect(cancelled.closed_at).not.toBeNull();
    const waiting = await taskRow(ids.waiting);
    expect(waiting.status).toBe("en_proceso");
    expect(waiting.closed_at).toBeNull();
  });

  it("backfills closed_at from history, else updated_at, and validates the check", async () => {
    const postventa = await taskRow(ids.postventa);
    expect(new Date(postventa.closed_at).toISOString()).toBe("2026-04-01T10:00:00.000Z");
    const reviewed = await taskRow(ids.reviewed);
    expect(new Date(reviewed.closed_at).toISOString()).toBe("2026-05-01T10:00:00.000Z");
    const noHistory = await taskRow(ids.completedNoHistory);
    expect(new Date(noHistory.closed_at).toISOString()).toBe("2026-02-15T00:00:00.000Z");
    expect((await taskRow(ids.unmatched)).closed_at).toBeNull();

    const [check] = await db.sql`select convalidated from pg_constraint where conname = 'tasks_closed_at_check'`;
    expect(check.convalidated).toBe(true);
    const [open] = await db.sql`
      select count(*)::int as n from core.tasks where status = 'completado' and closed_at is null`;
    expect(open.n).toBe(0);
  });

  it("runs 0024 a second time without errors or changes", async () => {
    const snapshot = async () => ({
      report: await db.sql`
        select kind, count(*)::int as n from core.project_flow_migration_report group by kind order by kind`,
      templates: await db.sql`select count(*)::int as n from core.workflow_task_templates`,
      phases: await db.sql`select count(*)::int as n from core.workflow_phases`,
      statuses: await db.sql`
        select name, closes, counts_as_completed from core.task_statuses where deleted_at is null order by name`,
    });
    const before = await snapshot();
    await applyInOneTransaction(db.sql, [BACKFILL]);
    expect(await snapshot()).toEqual(before);
  });
});

describe.skipIf(!url)("0023 + 0024 on an empty database (fresh install)", () => {
  let db: ScratchDb;

  beforeAll(async () => {
    db = await scratchDatabase();
    await applyInOneTransaction(db.sql, ["0023_project_flow_schema", BACKFILL]);
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  }, 60_000);

  it("applies with no data: no fases or templates yet, Cancelado and En espera created once", async () => {
    const [phases] = await db.sql`select count(*)::int as n from core.workflow_phases`;
    const [templates] = await db.sql`select count(*)::int as n from core.workflow_task_templates`;
    expect(phases.n).toBe(0);
    expect(templates.n).toBe(0);

    const statuses = await db.sql`
      select name, closes, counts_as_completed from core.task_statuses where deleted_at is null order by sort_order`;
    expect(statuses.map((s) => [s.name, s.closes, s.counts_as_completed])).toEqual([
      ["Cancelado", true, false],
      ["En espera", false, false],
    ]);
    expect(await reportRows(db.sql, "status_created")).toHaveLength(2);

    await applyInOneTransaction(db.sql, [BACKFILL]);
    const [count] = await db.sql`select count(*)::int as n from core.task_statuses`;
    expect(count.n).toBe(2);
  });
});
