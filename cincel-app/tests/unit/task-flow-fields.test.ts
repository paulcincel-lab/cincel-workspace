// @vitest-environment node
/**
 * Tasks with tramo, fase and espacio (project flow BE §7.5, §8.6) against a
 * real Postgres: createUserTask, updateTask, createSubtask and listTasks.
 * Runs only when TEST_DATABASE_URL points at a migrated database; every test
 * runs inside a transaction that is rolled back.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import type { FlowExecutor } from "@/lib/project-flow/db";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

// Test doubles of the catalog guards (same contract: throw the code on a mismatch).
vi.mock("@/lib/repositories/workflow-phases-repository", async () => {
  const { and: andOp, eq: eqOp } = await import("drizzle-orm");
  const s = await import("@/lib/db/schema");
  return {
    assertPhaseInWorkflow: vi.fn(async (tx: FlowExecutor, phaseId: string, workflowId: string) => {
      const [row] = await tx
        .select({ id: s.workflowPhases.id })
        .from(s.workflowPhases)
        .where(andOp(eqOp(s.workflowPhases.id, phaseId), eqOp(s.workflowPhases.workflowId, workflowId)));
      if (!row) throw new Error("PHASE_MISMATCH");
    }),
  };
});
vi.mock("@/lib/repositories/project-spaces-repository", async () => {
  const { and: andOp, eq: eqOp } = await import("drizzle-orm");
  const s = await import("@/lib/db/schema");
  return {
    assertSpaceInProject: vi.fn(async (tx: FlowExecutor, spaceId: string, projectId: string) => {
      const [row] = await tx
        .select({ id: s.projectSpaces.id })
        .from(s.projectSpaces)
        .where(andOp(eqOp(s.projectSpaces.id, spaceId), eqOp(s.projectSpaces.projectId, projectId)));
      if (!row) throw new Error("SPACE_MISMATCH");
    }),
  };
});

import { createSubtask, createUserTask, listTasks, updateTask } from "@/lib/repositories/tasks-repository";

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

type Ctx = {
  projectId: string;
  otherProjectId: string;
  staffId: string;
  /** Tramo with sort_order 1 and fases Anteproyecto (0), Ejecutivo (1). */
  workflowId: string;
  /** Tramo with sort_order 0. */
  firstWorkflowId: string;
  anteproyectoId: string;
  ejecutivoId: string;
  /** A fase of `firstWorkflowId`. */
  foreignPhaseId: string;
  cocinaId: string;
  /** An espacio of `otherProjectId`. */
  foreignSpaceId: string;
};

describe.skipIf(!url)("tasks with tramo, fase and espacio (test DB)", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  afterAll(() => sql.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  async function inTx(fn: (tx: Tx, ctx: Ctx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const [person] = await tx.insert(schema.staff).values({ name: "Ana Prueba" }).returning();
        const [project] = await tx.insert(schema.projects).values({ name: `Casa Flujo ${stamp}` }).returning();
        const [other] = await tx.insert(schema.projects).values({ name: `Casa Otra ${stamp}` }).returning();
        const [first] = await tx
          .insert(schema.workflows)
          .values({ key: `wf-a-${stamp}`, name: `Presale ${stamp}`, sortOrder: 0 })
          .returning();
        const [workflow] = await tx
          .insert(schema.workflows)
          .values({ key: `wf-b-${stamp}`, name: `Diseño ${stamp}`, sortOrder: 1 })
          .returning();
        const [ante, ejec] = await tx
          .insert(schema.workflowPhases)
          .values([
            { workflowId: workflow.id, name: "Anteproyecto", sortOrder: 0 },
            { workflowId: workflow.id, name: "Ejecutivo", sortOrder: 1 },
          ])
          .returning();
        const [foreignPhase] = await tx
          .insert(schema.workflowPhases)
          .values({ workflowId: first.id, name: "Cobro", sortOrder: 0 })
          .returning();
        const [cocina] = await tx
          .insert(schema.projectSpaces)
          .values({ projectId: project.id, name: "Cocina" })
          .returning();
        const [foreignSpace] = await tx
          .insert(schema.projectSpaces)
          .values({ projectId: other.id, name: "Baño" })
          .returning();
        await fn(tx, {
          projectId: project.id,
          otherProjectId: other.id,
          staffId: person.id,
          workflowId: workflow.id,
          firstWorkflowId: first.id,
          anteproyectoId: ante.id,
          ejecutivoId: ejec.id,
          foreignPhaseId: foreignPhase.id,
          cocinaId: cocina.id,
          foreignSpaceId: foreignSpace.id,
        });
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      })
      .finally(() => {
        holder.db = null;
      });
  }

  async function addTask(tx: Tx, ctx: Ctx, title: string, extra: Partial<typeof schema.tasks.$inferInsert> = {}) {
    const [row] = await tx
      .insert(schema.tasks)
      .values({ projectId: ctx.projectId, kind: "usuario", title, createdById: ctx.staffId, ...extra })
      .returning();
    return row;
  }

  describe("createUserTask", () => {
    it("rejects a task without a tramo, or with a deleted one, as INVALID", async () => {
      await inTx(async (tx, ctx) => {
        await expect(
          createUserTask({ projectId: ctx.projectId, title: "Sin tramo", workflowId: null }, ctx.staffId)
        ).rejects.toThrow(/^INVALID/);
        await tx.update(schema.workflows).set({ deletedAt: new Date() }).where(eq(schema.workflows.id, ctx.workflowId));
        await expect(
          createUserTask({ projectId: ctx.projectId, title: "Tramo borrado", workflowId: ctx.workflowId }, ctx.staffId)
        ).rejects.toThrow(/^INVALID/);
      });
    });

    it("returns PHASE_MISMATCH for a fase of another tramo and SPACE_MISMATCH for another project's espacio", async () => {
      await inTx(async (_tx, ctx) => {
        await expect(
          createUserTask(
            { projectId: ctx.projectId, title: "Fase ajena", workflowId: ctx.workflowId, phaseId: ctx.foreignPhaseId },
            ctx.staffId
          )
        ).rejects.toThrow("PHASE_MISMATCH");
        await expect(
          createUserTask(
            { projectId: ctx.projectId, title: "Espacio ajeno", workflowId: ctx.workflowId, spaceId: ctx.foreignSpaceId },
            ctx.staffId
          )
        ).rejects.toThrow("SPACE_MISMATCH");
      });
    });

    it("stores tramo, fase and espacio and writes no project_stages row", async () => {
      await inTx(async (tx, ctx) => {
        const task = await createUserTask(
          {
            projectId: ctx.projectId,
            title: "Planos de cocina",
            workflowId: ctx.workflowId,
            phaseId: ctx.anteproyectoId,
            spaceId: ctx.cocinaId,
          },
          ctx.staffId
        );
        expect(task).toMatchObject({
          kind: "usuario",
          workflowId: ctx.workflowId,
          phaseId: ctx.anteproyectoId,
          spaceId: ctx.cocinaId,
          phase: { id: ctx.anteproyectoId, name: "Anteproyecto", sortOrder: 0 },
          space: { id: ctx.cocinaId, name: "Cocina" },
        });
        expect(task).not.toHaveProperty("phaseRef");
        const stages = await tx
          .select()
          .from(schema.projectStages)
          .where(eq(schema.projectStages.projectId, ctx.projectId));
        expect(stages).toHaveLength(0);
      });
    });
  });

  describe("updateTask", () => {
    it("rejects changing the tramo of a task that already has one", async () => {
      await inTx(async (tx, ctx) => {
        const task = await addTask(tx, ctx, "Con tramo", { workflowId: ctx.workflowId });
        await expect(updateTask(task.id, { workflowId: ctx.firstWorkflowId }, ctx.staffId)).rejects.toThrow(
          /^INVALID/
        );
        // Sending the same tramo again is a no-op.
        await expect(updateTask(task.id, { workflowId: ctx.workflowId }, ctx.staffId)).resolves.toMatchObject({
          workflowId: ctx.workflowId,
        });
      });
    });

    it("sets the tramo of a task with none and checks a fase sent with it against the new tramo", async () => {
      await inTx(async (tx, ctx) => {
        const legacy = await addTask(tx, ctx, "Sin tramo");
        await expect(
          updateTask(legacy.id, { workflowId: ctx.workflowId, phaseId: ctx.foreignPhaseId }, ctx.staffId)
        ).rejects.toThrow("PHASE_MISMATCH");
        const placed = await updateTask(
          legacy.id,
          { workflowId: ctx.workflowId, phaseId: ctx.ejecutivoId },
          ctx.staffId
        );
        expect(placed).toMatchObject({ workflowId: ctx.workflowId, phaseId: ctx.ejecutivoId });
      });
    });

    it("moves fase and espacio within the task's tramo and project, and records them", async () => {
      await inTx(async (tx, ctx) => {
        const task = await addTask(tx, ctx, "Mover", { workflowId: ctx.workflowId, phaseId: ctx.anteproyectoId });
        await expect(updateTask(task.id, { phaseId: ctx.foreignPhaseId }, ctx.staffId)).rejects.toThrow(
          "PHASE_MISMATCH"
        );
        await expect(updateTask(task.id, { spaceId: ctx.foreignSpaceId }, ctx.staffId)).rejects.toThrow(
          "SPACE_MISMATCH"
        );
        const moved = await updateTask(task.id, { phaseId: ctx.ejecutivoId, spaceId: ctx.cocinaId }, ctx.staffId);
        expect(moved).toMatchObject({ phaseId: ctx.ejecutivoId, spaceId: ctx.cocinaId });
        const fields = moved.history.map((h) => h.field);
        expect(fields).toEqual(expect.arrayContaining(["phaseId", "spaceId"]));
        const cleared = await updateTask(task.id, { phaseId: null, spaceId: null }, ctx.staffId);
        expect(cleared).toMatchObject({ phaseId: null, spaceId: null, phase: null, space: null });
      });
    });

    it("rejects a fase or espacio on an admin task with ADMIN_TASK", async () => {
      await inTx(async (tx, ctx) => {
        const admin = await addTask(tx, ctx, "Asignar cliente", { kind: "admin" });
        await expect(updateTask(admin.id, { spaceId: ctx.cocinaId }, ctx.staffId)).rejects.toThrow("ADMIN_TASK");
        await expect(updateTask(admin.id, { phaseId: ctx.anteproyectoId }, ctx.staffId)).rejects.toThrow(
          "ADMIN_TASK"
        );
        await expect(updateTask(admin.id, { workflowId: ctx.workflowId }, ctx.staffId)).rejects.toThrow(/^INVALID/);
      });
    });
  });

  describe("createSubtask", () => {
    it("inherits the parent's tramo and fase and takes an espacio of the project", async () => {
      await inTx(async (tx, ctx) => {
        const parent = await addTask(tx, ctx, "Padre", { workflowId: ctx.workflowId, phaseId: ctx.ejecutivoId });
        const child = await createSubtask(parent.id, { title: "Hija", spaceId: ctx.cocinaId }, ctx.staffId);
        expect(child).toMatchObject({
          workflowId: ctx.workflowId,
          phaseId: ctx.ejecutivoId,
          spaceId: ctx.cocinaId,
          parentTaskId: parent.id,
        });
        await expect(
          createSubtask(parent.id, { title: "Hija ajena", spaceId: ctx.foreignSpaceId }, ctx.staffId)
        ).rejects.toThrow("SPACE_MISMATCH");
      });
    });
  });

  describe("listTasks", () => {
    it("filters by fase and espacio", async () => {
      await inTx(async (tx, ctx) => {
        const a = await addTask(tx, ctx, "A", { workflowId: ctx.workflowId, phaseId: ctx.anteproyectoId, spaceId: ctx.cocinaId });
        await addTask(tx, ctx, "B", { workflowId: ctx.workflowId, phaseId: ctx.ejecutivoId });
        const byPhase = await listTasks({ projectId: ctx.projectId, phaseId: ctx.anteproyectoId });
        expect(byPhase.map((t) => t.id)).toEqual([a.id]);
        const bySpace = await listTasks({ projectId: ctx.projectId, spaceId: ctx.cocinaId });
        expect(bySpace.map((t) => t.id)).toEqual([a.id]);
      });
    });

    it("searches fase and espacio names too", async () => {
      await inTx(async (tx, ctx) => {
        const a = await addTask(tx, ctx, "Planos", { workflowId: ctx.workflowId, spaceId: ctx.cocinaId });
        const b = await addTask(tx, ctx, "Renders", { workflowId: ctx.workflowId, phaseId: ctx.ejecutivoId });
        expect((await listTasks({ projectId: ctx.projectId, search: "cocina" })).map((t) => t.id)).toEqual([a.id]);
        expect((await listTasks({ projectId: ctx.projectId, search: "ejecut" })).map((t) => t.id)).toEqual([b.id]);
      });
    });

    it("orders by tramo, then fase, then manual order; missing ones go last", async () => {
      await inTx(async (tx, ctx) => {
        const noTramo = await addTask(tx, ctx, "Sin tramo");
        const ejec = await addTask(tx, ctx, "Ejecutivo 1", { workflowId: ctx.workflowId, phaseId: ctx.ejecutivoId, sortOrder: 0 });
        const noPhase = await addTask(tx, ctx, "Sin fase", { workflowId: ctx.workflowId });
        const ante2 = await addTask(tx, ctx, "Ante 2", { workflowId: ctx.workflowId, phaseId: ctx.anteproyectoId, sortOrder: 2 });
        const ante1 = await addTask(tx, ctx, "Ante 1", { workflowId: ctx.workflowId, phaseId: ctx.anteproyectoId, sortOrder: 1 });
        const first = await addTask(tx, ctx, "Presale", { workflowId: ctx.firstWorkflowId, phaseId: ctx.foreignPhaseId });
        const rows = await listTasks({ projectId: ctx.projectId });
        expect(rows.map((t) => t.id)).toEqual([first.id, ante1.id, ante2.id, ejec.id, noPhase.id, noTramo.id]);
      });
    });
  });
});
