// @vitest-environment node
/**
 * scripts/default-workflows.mjs. The in-memory cases always run; the database
 * cases run only when TEST_DATABASE_URL points at a migrated database, each
 * inside a transaction that is rolled back.
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockEtapaCatalog } from "@/tests/setup/catalog-lock";

import { DEFAULT_WORKFLOWS, ensureDefaultWorkflows } from "@/scripts/default-workflows.mjs";

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

/** A tagged-template stand-in for postgres.js backed by an in-memory core.workflows. */
function fakeSql(initial: Array<{ key: string; name: string }> = []) {
  const rows = initial.map((r, i) => ({ id: `existing-${i}`, ...r, sortOrder: i }));
  const queries: string[] = [];
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    queries.push(text);
    if (/select count\(\*\)/.test(text)) return [{ count: rows.length }];
    if (/insert into core\.workflows/.test(text)) {
      const [key, name, sortOrder] = values as [string, string, number];
      if (rows.some((r) => r.key === key)) return [];
      const row = { id: `new-${rows.length}`, key, name, sortOrder };
      rows.push(row);
      return [{ id: row.id }];
    }
    throw new Error(`unexpected query: ${text}`);
  };
  return { sql: sql as unknown as postgres.Sql, rows, queries };
}

describe("DEFAULT_WORKFLOWS", () => {
  it("lists Presale, Diseño and Construcción in order", () => {
    expect(DEFAULT_WORKFLOWS.map((w) => w.key)).toEqual(["presale", "diseno", "construccion"]);
    expect(DEFAULT_WORKFLOWS.map((w) => w.name)).toEqual(["Presale", "Diseño", "Construcción"]);
  });

  it("starts Presale on project create and the others by hand", () => {
    expect(DEFAULT_WORKFLOWS.map((w) => w.autoStart)).toEqual(["on_create", "manual", "manual"]);
  });
});

describe("ensureDefaultWorkflows", () => {
  it("creates every default on an empty table, then nothing on repeat", async () => {
    const db = fakeSql();
    expect(await ensureDefaultWorkflows(db.sql)).toBe(DEFAULT_WORKFLOWS.length);
    expect(db.rows.map((r) => [r.key, r.name, r.sortOrder])).toEqual([
      ["presale", "Presale", 0],
      ["diseno", "Diseño", 1],
      ["construccion", "Construcción", 2],
    ]);

    const before = db.queries.length;
    expect(await ensureDefaultWorkflows(db.sql)).toBe(0);
    expect(db.queries.slice(before).some((q) => /insert/.test(q))).toBe(false);
    expect(db.rows).toHaveLength(DEFAULT_WORKFLOWS.length);
  });

  it("leaves an install that already has workflows untouched", async () => {
    const db = fakeSql([{ key: "custom", name: "Mi flujo" }]);
    expect(await ensureDefaultWorkflows(db.sql)).toBe(0);
    expect(db.rows).toEqual([{ id: "existing-0", key: "custom", name: "Mi flujo", sortOrder: 0 }]);
    expect(db.queries.some((q) => /insert/.test(q))).toBe(false);
  });
});

describe.skipIf(!url)("ensureDefaultWorkflows (test DB)", () => {
  // One catalog-changing file at a time (see tests/setup/catalog-lock.ts).
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockEtapaCatalog(url!);
  }, 300_000);
  afterAll(async () => {
    await unlockCatalog?.();
  });

  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  afterAll(() => sql.end());

  async function inTx(fn: (tx: postgres.TransactionSql) => Promise<void>) {
    await sql
      .begin(async (tx) => {
        await fn(tx);
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  }

  async function clearWorkflows(tx: postgres.TransactionSql) {
    // Rolled back with the transaction. Workflow tasks restrict the delete, so they go first.
    await tx`delete from core.tasks where workflow_id is not null`;
    await tx`delete from core.etapa_start_batches`;
    await tx`delete from core.workflow_task_templates`;
    await tx`delete from core.position_phases`;
    await tx`delete from core.workflow_phases`;
    await tx`delete from core.project_stages`;
    await tx`update core.projects set current_workflow_id = null where current_workflow_id is not null`;
    await tx`delete from core.workflows`;
  }

  it("creates the defaults on an empty table, then nothing the second time", async () => {
    await inTx(async (tx) => {
      await clearWorkflows(tx);
      expect(await ensureDefaultWorkflows(tx)).toBe(DEFAULT_WORKFLOWS.length);
      const rows = await tx`
        select key, name, sort_order, active from core.workflows where deleted_at is null order by sort_order`;
      expect(rows.map((r) => [r.key, r.name, r.sort_order, r.active])).toEqual([
        ["presale", "Presale", 0, true],
        ["diseno", "Diseño", 1, true],
        ["construccion", "Construcción", 2, true],
      ]);

      expect(await ensureDefaultWorkflows(tx)).toBe(0);
      const [{ count }] = await tx`select count(*)::int as count from core.workflows`;
      expect(count).toBe(DEFAULT_WORKFLOWS.length);
    });
  });

  it("does not touch existing workflows", async () => {
    await inTx(async (tx) => {
      await clearWorkflows(tx);
      await tx`insert into core.workflows (key, name, sort_order) values ('presale', 'Ventas', 5)`;
      expect(await ensureDefaultWorkflows(tx)).toBe(0);
      const rows = await tx`select key, name, sort_order from core.workflows`;
      expect(rows.map((r) => [r.key, r.name, r.sort_order])).toEqual([["presale", "Ventas", 5]]);
    });
  });

  it("a fresh install can create a project and a task in a default workflow", async () => {
    await inTx(async (tx) => {
      await clearWorkflows(tx);
      await ensureDefaultWorkflows(tx);
      const [workflow] = await tx`select id from core.workflows where key = 'presale'`;
      const [client] = await tx`
        insert into core.contacts (type, name) values ('cliente', 'Cliente default-workflows test') returning id`;
      const [staff] = await tx`
        insert into core.staff (name, email, role, active)
        values ('Default Workflows Test', 'default-workflows-test@example.dev', 'Administrador', true) returning id`;
      const [project] = await tx`
        insert into core.projects (name, client_id, current_workflow_id)
        values ('Proyecto default-workflows test', ${client.id}, ${workflow.id}) returning id`;
      await tx`insert into core.project_stages (project_id, workflow_id) values (${project.id}, ${workflow.id})`;
      const [task] = await tx`
        insert into core.tasks (project_id, kind, title, created_by_id)
        values (${project.id}, 'usuario', 'Primera tarea', ${staff.id}) returning id`;
      expect(task?.id).toBeTruthy();
    });
  });
});
