// @vitest-environment node
/**
 * scripts/monday/apply.ts and scripts/monday/rollback.ts under the project flow
 * (docs/specs/project-flow/backend.md §10.5, §10.9): tramos, fases, espacios,
 * kinds, closed_at, the "Asignar cliente y origen" task, the v2 mapping with
 * the status-map snapshot, re-apply, and a rollback that removes it all.
 *
 * The pure helpers and the delete order run everywhere. The DB cases need
 * TEST_DATABASE_URL pointing at a migrated database; each runs in a
 * transaction that is rolled back. They call `writePhaseA` with a planned
 * translation built here, so they don't depend on the export fixtures.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import type { ImportDb, ImportEntity } from "@/lib/import/refs";
import { ASSIGN_CLIENT_SYSTEM_KEY, MONDAY_STATUS_MAP_SETTING } from "@/lib/project-flow/catalog";
import {
  flowTaskColumns,
  projectTramos,
  spaceExternalId,
  writePhaseA,
  type BatchInfo,
} from "@/scripts/monday/apply";
import type { PlanTranslation } from "@/scripts/monday/plan";
import {
  DELETE_STEPS,
  deleteBatchRows,
  ENTITY_TABLES,
  findRollbackBlockers,
  POINTER_CHECKS,
} from "@/scripts/monday/rollback";

// The project flow helpers apply calls may still be contracts in this tree; the
// fallbacks below follow their documented behaviour so these cases test apply
// and rollback themselves. The real implementations run whenever they exist.
const isStub = (err: unknown) => err instanceof Error && err.message.startsWith("not implemented");
type Tx = ImportDb;

vi.mock("@/lib/repositories/project-spaces-repository", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/repositories/project-spaces-repository")>();
  return {
    ...real,
    findOrCreateSpace: async (tx: Tx, projectId: string, name: string): Promise<string> => {
      try {
        return await real.findOrCreateSpace(tx as never, projectId, name);
      } catch (err) {
        if (!isStub(err)) throw err;
        const [found] = await tx
          .select({ id: schema.projectSpaces.id })
          .from(schema.projectSpaces)
          .where(
            and(
              eq(schema.projectSpaces.projectId, projectId),
              sql`lower(${schema.projectSpaces.name}) = lower(${name})`,
            ),
          );
        if (found) return found.id;
        const [row] = await tx
          .insert(schema.projectSpaces)
          .values({ projectId, name })
          .returning({ id: schema.projectSpaces.id });
        return row.id;
      }
    },
  };
});

vi.mock("@/lib/project-flow/closing", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/project-flow/closing")>();
  return {
    ...real,
    refreshStageClosed: async (tx: Tx, projectId: string, workflowId: string): Promise<void> => {
      try {
        return await real.refreshStageClosed(tx as never, projectId, workflowId);
      } catch (err) {
        if (!isStub(err)) throw err;
        await tx.execute(sql`update core.project_stages s
          set closed_at = case when exists (
            select 1 from core.tasks t
            where t.project_id = ${projectId} and t.workflow_id = ${workflowId}
              and t.deleted_at is null and t.status <> 'completado'
          ) then null else now() end
          where s.project_id = ${projectId} and s.workflow_id = ${workflowId}`);
      }
    },
  };
});

vi.mock("@/lib/project-flow/admin-tasks", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/project-flow/admin-tasks")>();
  return {
    ...real,
    ensureAssignClientTask: async (tx: Tx, projectId: string, actorId: string): Promise<string | null> => {
      try {
        return await real.ensureAssignClientTask(tx as never, projectId, actorId);
      } catch (err) {
        if (!isStub(err)) throw err;
        const [row] = await tx
          .insert(schema.tasks)
          .values({
            projectId,
            kind: "admin",
            systemKey: "assign_client",
            title: "Asignar cliente y origen",
            priority: "alta",
            createdById: actorId,
          })
          .returning({ id: schema.tasks.id });
        return row.id;
      }
    },
  };
});

const W1 = "71000000-0000-4000-8000-000000000001";
const W2 = "71000000-0000-4000-8000-000000000002";
const P1 = "72000000-0000-4000-8000-000000000001";
const P2 = "72000000-0000-4000-8000-000000000002";

describe("apply project flow helpers", () => {
  const base = {
    externalId: "i1",
    kind: "usuario" as const,
    templateId: null,
    workflowId: W1,
    phaseId: P1,
    status: "completado" as const,
    closedAt: "2026-10-01T05:59:59.000Z",
  };

  it("keeps fase, espacio and closed_at on a closed tramo task", () => {
    expect(flowTaskColumns(base as never, "s1")).toEqual({
      kind: "usuario",
      templateId: null,
      workflowId: W1,
      phaseId: P1,
      spaceId: "s1",
      closedAt: new Date("2026-10-01T05:59:59.000Z"),
      systemKey: null,
    });
  });

  it("drops closed_at on an open task and the fase without a tramo", () => {
    const cols = flowTaskColumns({ ...base, status: "pendiente", workflowId: null } as never, null);
    expect(cols.closedAt).toBeNull();
    expect(cols.phaseId).toBeNull();
  });

  it("clears tramo, fase, espacio and template on an admin task", () => {
    const cols = flowTaskColumns({ ...base, kind: "admin", templateId: "t" } as never, "s1");
    expect(cols).toMatchObject({ kind: "admin", templateId: null, workflowId: null, phaseId: null, spaceId: null });
  });

  it("marks the planned assign_client task with its system key", () => {
    expect(flowTaskColumns({ ...base, externalId: "b1:assign_client", kind: "admin" } as never, null).systemKey).toBe(
      ASSIGN_CLIENT_SYSTEM_KEY,
    );
  });

  it("keys espacios by board and group, per project when the project isn't the board", () => {
    expect(spaceExternalId("b1", { boardId: "b1", groupId: "g1" })).toBe("b1:g1");
    expect(spaceExternalId("item9", { boardId: "b1", groupId: "g1" })).toBe("item9/b1:g1");
  });

  it("gives a stage to every tramo with tasks and makes the highest one current", () => {
    const order = new Map([
      [W1, 10],
      [W2, 20],
    ]);
    expect(projectTramos({ workflowId: W1 } as never, [W2, W1, null, W2], order)).toEqual({
      tramos: [W1, W2],
      currentWorkflowId: W2,
    });
    // No tasks: the board's tramo, which then has its stage.
    expect(projectTramos({ workflowId: W1 } as never, [], order)).toEqual({ tramos: [W1], currentWorkflowId: W1 });
    // translate's current tramo wins.
    expect(projectTramos({ workflowId: W1, currentWorkflowId: W1 } as never, [W2], order)).toEqual({
      tramos: [W1, W2],
      currentWorkflowId: W1,
    });
  });
});

describe("rollback project flow steps", () => {
  const labels = DELETE_STEPS.map((s) => s.label);

  it("deletes espacios after the task refs and before the project refs", () => {
    const space = labels.indexOf(ENTITY_TABLES.project_space.table);
    expect(space).toBeGreaterThan(labels.indexOf("tasks"));
    expect(space).toBeGreaterThan(labels.indexOf("child tasks"));
    expect(space).toBeLessThan(labels.indexOf("projects"));
    // The stages step stays right before the projects.
    expect(labels.indexOf("project_stages")).toBe(labels.indexOf("projects") - 1);
  });

  it("lets start batches go with the project and owns the import's espacios", () => {
    const check = (table: string, column: string) =>
      POINTER_CHECKS.find((c) => c.table === table && c.column === column)?.owner;
    expect(check("tramo_start_batches", "project_id")).toBe("cascade");
    expect(check("project_spaces", "project_id")).toEqual({ entity: "project_space" });
    expect(check("tasks", "space_id")).toEqual({ entity: "task" });
  });
});

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)("apply and rollback, project flow (test DB)", { timeout: 60_000 }, () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  async function inTx(fn: (tx: ImportDb) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx);
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  const BATCH: BatchInfo = {
    accountId: "apply-project-flow-765",
    accountSlug: "pf",
    accountName: "Project flow",
    exportedByEmail: null,
    exportedAt: new Date("2026-11-01T00:00:00.000Z"),
    exportPath: "/tmp/apply-project-flow-765",
    apiVersion: "2025-04",
  };
  const STATUS_MAP = { "en curso": { target: { status: "en_proceso" }, priority: "alta" } };

  async function seed(tx: ImportDb) {
    const [ana] = await tx
      .insert(schema.staff)
      .values({ name: "Ana Flujo 765", email: "ana.flujo.765@example.test" })
      .returning();
    const [beto] = await tx
      .insert(schema.staff)
      .values({ name: "Beto Creado 765", email: "beto.creado.765@example.test" })
      .returning();
    const [position] = await tx.insert(schema.positions).values({ name: "Puesto Prueba 765" }).returning();
    await tx.insert(schema.staffPositions).values({ staffId: beto.id, positionId: position.id });
    await tx.insert(schema.workflows).values([
      { id: W1, key: "pf765-diseno", name: "Diseño 765", sortOrder: 9010 },
      { id: W2, key: "pf765-obra", name: "Construcción 765", sortOrder: 9020 },
    ]);
    await tx.insert(schema.workflowPhases).values([
      { id: P1, workflowId: W1, name: "Planos 765" },
      { id: P2, workflowId: W2, name: "Obra negra 765" },
    ]);
    await tx
      .insert(schema.appSettings)
      .values({ key: MONDAY_STATUS_MAP_SETTING, value: JSON.stringify(STATUS_MAP) })
      .onConflictDoUpdate({ target: schema.appSettings.key, set: { value: JSON.stringify(STATUS_MAP) } });
    return { anaId: ana.id, betoId: beto.id };
  }

  const source = (groupId: string, groupTitle: string) => ({
    boardId: "b765",
    boardName: "Casa 765",
    groupId,
    groupTitle,
  });

  function translation(anaId: string, betoId: string, imported = new Map<ImportEntity, Map<string, string>>()) {
    const project = { kind: "planned", entity: "project", externalId: "b765" } as const;
    const task = (over: Record<string, unknown>) => ({
      entity: "task",
      project,
      parentTask: null,
      kind: "usuario",
      templateId: null,
      workflowId: W1,
      phaseId: null,
      space: null,
      closedAt: null,
      notes: null,
      status: "pendiente",
      customStatusId: null,
      priority: "media",
      managerId: null,
      seccion: null,
      seccionOrder: null,
      sortOrder: 1,
      commitmentDate: null,
      deliveryDate: null,
      start: null,
      milestone: false,
      createdAt: null,
      createdById: anaId,
      unmatchedPeople: [],
      data: { source: source("g1", "Cocina"), columns: {} },
      source: source("g1", "Cocina"),
      ...over,
    });
    return {
      mapping: {
        version: 2,
        boards: [],
        people: { u1: { action: "staff", staffId: betoId, created: true } },
        options: { includeUpdates: true, includeFiles: true },
        statusMap: {},
      },
      imported,
      files: [],
      result: {
        contacts: [],
        contactPeople: [],
        providerProfiles: [],
        projects: [
          {
            entity: "project",
            externalId: "b765",
            name: "Casa 765",
            code: null,
            client: null,
            status: "activo",
            progress: 0,
            startDate: null,
            endDate: null,
            workflowId: W1,
            source: source("", ""),
            data: { source: source("", ""), columns: {} },
          },
        ],
        tasks: [
          task({
            externalId: "i1",
            title: "Planos",
            phaseId: P1,
            space: "Cocina",
            status: "completado",
            closedAt: "2026-10-01T05:59:59.000Z",
            createdAt: "2026-09-01T00:00:00.000Z",
          }),
          task({
            externalId: "i2",
            title: "Cimentación",
            workflowId: W2,
            phaseId: P2,
            space: "Cocina",
            closedAt: "2026-10-02T05:59:59.000Z",
            createdAt: "2026-09-15T00:00:00.000Z",
          }),
          task({
            externalId: "i3",
            title: "Pagar permisos",
            kind: "admin",
            workflowId: W1,
            phaseId: P1,
            space: "Cocina",
            source: source("g9", "Administrativo"),
          }),
        ],
        taskSupport: [],
        taskDependencies: [],
        checklistItems: [],
        historyEvents: [],
        files: [],
        projectSchedules: [],
        scheduleTasks: [],
        issues: [],
      },
    } as unknown as PlanTranslation;
  }

  async function refsOf(tx: ImportDb, batchId: string) {
    return tx.select().from(schema.importRefs).where(eq(schema.importRefs.batchId, batchId));
  }

  async function importedMap(tx: ImportDb, batchId: string) {
    const map = new Map<ImportEntity, Map<string, string>>();
    for (const r of await refsOf(tx, batchId)) {
      const e = r.entity as ImportEntity;
      if (!map.has(e)) map.set(e, new Map());
      map.get(e)!.set(r.externalId, r.rowId);
    }
    return map;
  }

  it("writes tramos, fases, espacios, kinds, closed_at, the assign_client task and a v2 mapping", async () => {
    await inTx(async (tx) => {
      const { anaId, betoId } = await seed(tx);
      const { batchId, counts } = await writePhaseA(tx, translation(anaId, betoId), BATCH, anaId);
      expect(counts).toMatchObject({ projects: 1, tasks: 3, spaces: 1, stages: 2, assignClientTasks: 1 });

      const refs = await refsOf(tx, batchId);
      const rowOf = (entity: string, ext: string) => refs.find((r) => r.entity === entity && r.externalId === ext)!.rowId;
      const projectId = rowOf("project", "b765");

      const [project] = await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId));
      expect(project).toMatchObject({ clientId: null, origin: "monday", currentWorkflowId: W2 });

      const stages = await tx.select().from(schema.projectStages).where(eq(schema.projectStages.projectId, projectId));
      const stage = (w: string) => stages.find((s) => s.workflowId === w)!;
      expect(stages.map((s) => s.workflowId).sort()).toEqual([W1, W2].sort());
      expect(stage(W1)).toMatchObject({ startedById: anaId, startedAt: new Date("2026-09-01T00:00:00.000Z") });
      expect(stage(W2).startedAt).toEqual(new Date("2026-09-15T00:00:00.000Z"));
      // refreshStageClosed: every Diseño task is closed, Construcción isn't.
      expect(stage(W1).closedAt).not.toBeNull();
      expect(stage(W2).closedAt).toBeNull();

      const spaces = await tx.select().from(schema.projectSpaces).where(eq(schema.projectSpaces.projectId, projectId));
      expect(spaces.map((s) => s.name)).toEqual(["Cocina"]);
      expect(rowOf("project_space", "b765:g1")).toBe(spaces[0].id);

      const task = async (ext: string) =>
        (await tx.select().from(schema.tasks).where(eq(schema.tasks.id, rowOf("task", ext))))[0];
      expect(await task("i1")).toMatchObject({
        kind: "usuario",
        title: "Planos",
        workflowId: W1,
        phaseId: P1,
        spaceId: spaces[0].id,
        status: "completado",
        closedAt: new Date("2026-10-01T05:59:59.000Z"),
      });
      expect(await task("i2")).toMatchObject({ workflowId: W2, phaseId: P2, spaceId: spaces[0].id, closedAt: null });
      expect(await task("i3")).toMatchObject({ kind: "admin", workflowId: null, phaseId: null, spaceId: null });
      expect(await task(`b765:${ASSIGN_CLIENT_SYSTEM_KEY}`)).toMatchObject({
        kind: "admin",
        systemKey: ASSIGN_CLIENT_SYSTEM_KEY,
        projectId,
      });

      const [batch] = await tx.select().from(schema.importBatches).where(eq(schema.importBatches.id, batchId));
      expect(batch.mapping).toMatchObject({ version: 2, statusMap: STATUS_MAP });
    });
  });

  it("re-applying the same plan creates nothing", async () => {
    await inTx(async (tx) => {
      const { anaId, betoId } = await seed(tx);
      const first = await writePhaseA(tx, translation(anaId, betoId), BATCH, anaId);
      const imported = await importedMap(tx, first.batchId);
      const count = async (table: "project_spaces" | "project_stages" | "tasks") => {
        const result = (await tx.execute(sql.raw(`select count(*)::int as n from core.${table}`))) as unknown;
        const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
        return Number((rows[0] as { n: unknown }).n);
      };
      const before = [await count("project_spaces"), await count("project_stages"), await count("tasks")];

      const second = await writePhaseA(tx, translation(anaId, betoId, imported), BATCH, anaId);
      expect(Object.values(second.counts).every((n) => n === 0)).toBe(true);
      expect([await count("project_spaces"), await count("project_stages"), await count("tasks")]).toEqual(before);
      const [batch] = await tx.select().from(schema.importBatches).where(eq(schema.importBatches.id, second.batchId));
      expect(batch.status).toBe("applied");
    });
  });

  it("rollback removes projects, stages, espacios, admin tasks, start batches and created staff's puestos", async () => {
    await inTx(async (tx) => {
      const { anaId, betoId } = await seed(tx);
      const { batchId } = await writePhaseA(tx, translation(anaId, betoId), BATCH, anaId);
      const refs = await refsOf(tx, batchId);
      const projectId = refs.find((r) => r.entity === "project")!.rowId;

      // A later "Iniciar tramo" that created nothing still left its batch row: it goes with the project.
      await tx.insert(schema.tramoStartBatches).values({ projectId, workflowId: W2, assignmentMode: "none" });
      expect(await findRollbackBlockers(tx, batchId)).toEqual([]);

      await deleteBatchRows(tx, batchId);
      expect(await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId))).toEqual([]);
      expect(await tx.select().from(schema.tasks).where(eq(schema.tasks.projectId, projectId))).toEqual([]);
      expect(await tx.select().from(schema.projectSpaces).where(eq(schema.projectSpaces.projectId, projectId))).toEqual([]);
      expect(await tx.select().from(schema.projectStages).where(eq(schema.projectStages.projectId, projectId))).toEqual([]);
      expect(
        await tx.select().from(schema.tramoStartBatches).where(eq(schema.tramoStartBatches.projectId, projectId)),
      ).toEqual([]);
      expect(await refsOf(tx, batchId)).toEqual([]);

      const [beto] = await tx.select().from(schema.staff).where(eq(schema.staff.id, betoId));
      expect(beto.deletedAt).not.toBeNull();
      expect(await tx.select().from(schema.staffPositions).where(eq(schema.staffPositions.staffId, betoId))).toEqual([]);
      const [ana] = await tx
        .select()
        .from(schema.staff)
        .where(and(eq(schema.staff.id, anaId), isNull(schema.staff.deletedAt)));
      expect(ana).toBeDefined();
    });
  });

  it("an espacio or a task made in Cincel afterwards blocks the rollback", async () => {
    await inTx(async (tx) => {
      const { anaId, betoId } = await seed(tx);
      const { batchId } = await writePhaseA(tx, translation(anaId, betoId), BATCH, anaId);
      const refs = await refsOf(tx, batchId);
      const projectId = refs.find((r) => r.entity === "project")!.rowId;
      const spaceId = refs.find((r) => r.entity === "project_space")!.rowId;

      await tx.insert(schema.projectSpaces).values({ projectId, name: "Baño" });
      await tx.insert(schema.tasks).values({
        projectId,
        kind: "usuario",
        workflowId: W1,
        spaceId,
        title: "Hecha en Cincel",
        createdById: anaId,
      });
      const blockers = await findRollbackBlockers(tx, batchId);
      const tables = blockers.map((b) => `${b.table}:${b.what.split(" ")[0]}`);
      expect(tables).toContain("project_spaces:project_id");
      expect(tables).toContain("tasks:space_id");
      expect(tables).toContain("tasks:project_id");
      expect(blockers.some((b) => b.table === "tramo_start_batches")).toBe(false);
    });
  });
});
