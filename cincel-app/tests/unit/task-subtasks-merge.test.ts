// @vitest-environment node
/**
 * Subtasks (createSubtask, listSubtasks) and mergeTasks moving children and
 * dependencies, against a real Postgres. Runs only when TEST_DATABASE_URL
 * points at a migrated database; every test runs inside a transaction that
 * is rolled back.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

import {
  createSubtask,
  listSubtasks,
  listTasks,
  mergeTasks,
  restoreTask,
  softDeleteTask,
  TASK_RESTORE_WINDOW_MS,
} from "@/lib/repositories/tasks-repository";

const url = process.env.TEST_DATABASE_URL;

/** Administrator scope: these tests cover every kind. */
const VIEWER = { staffId: "", isAdmin: true };

class Rollback extends Error {}

type Ctx = { projectId: string; staffId: string; workflowId: string };

describe.skipIf(!url)("subtasks and mergeTasks (test DB)", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  afterAll(() => sql.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  async function inTx(fn: (tx: Tx, ctx: Ctx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const [person] = await tx
          .insert(schema.staff)
          .values({ name: "Ana Prueba" })
          .returning();
        const [client] = await tx
          .insert(schema.contacts)
          .values({ type: "cliente", name: "Cliente Subtareas" })
          .returning();
        const [project] = await tx
          .insert(schema.projects)
          .values({ name: "Proyecto Subtareas", clientId: client.id })
          .returning();
        const [workflow] = await tx
          .insert(schema.workflows)
          .values({ key: `wf-subtareas-${Date.now()}`, name: "Diseño prueba" })
          .returning();
        await fn(tx, {
          projectId: project.id,
          staffId: person.id,
          workflowId: workflow.id,
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

  async function addTask(
    tx: Tx,
    ctx: Ctx,
    title: string,
    extra: Partial<typeof schema.tasks.$inferInsert> = {},
  ) {
    const [row] = await tx
      .insert(schema.tasks)
      .values({
        projectId: ctx.projectId,
        kind: "usuario",
        title,
        createdById: ctx.staffId,
        managerId: ctx.staffId,
        ...extra,
      })
      .returning();
    return row;
  }

  async function parentOf(tx: Tx, id: string) {
    const [row] = await tx
      .select({ parentTaskId: schema.tasks.parentTaskId })
      .from(schema.tasks)
      .where(eq(schema.tasks.id, id));
    return row.parentTaskId;
  }

  async function depsOf(tx: Tx, ids: string[]) {
    const rows = await tx
      .select({
        taskId: schema.taskDependencies.taskId,
        dependsOnTaskId: schema.taskDependencies.dependsOnTaskId,
      })
      .from(schema.taskDependencies)
      .where(
        or(
          inArray(schema.taskDependencies.taskId, ids),
          inArray(schema.taskDependencies.dependsOnTaskId, ids),
        ),
      );
    return rows.map((r) => `${r.taskId}>${r.dependsOnTaskId}`).sort();
  }

  describe("createSubtask", () => {
    it("creates a usuario child with the parent's project, fase and etapa", async () => {
      await inTx(async (tx, ctx) => {
        const [fase] = await tx
          .insert(schema.workflowPhases)
          .values({ workflowId: ctx.workflowId, name: "Anteproyecto" })
          .returning();
        const parent = await addTask(tx, ctx, "Padre", {
          phaseId: fase.id,
          workflowId: ctx.workflowId,
        });
        const child = await createSubtask(
          parent.id,
          {
            title: "  Hija  ",
            managerId: ctx.staffId,
            commitmentDate: "2026-11-05",
          },
          ctx.staffId,
        );
        expect(child).toMatchObject({
          kind: "usuario",
          title: "Hija",
          projectId: ctx.projectId,
          phaseId: fase.id,
          phase: { id: fase.id, name: "Anteproyecto" },
          workflowId: ctx.workflowId,
          parentTaskId: parent.id,
          parentTitle: "Padre",
          commitmentDate: "2026-11-05",
        });
      });
    });

    it("refuses a parent that is already a subtask with TASK_NESTED", async () => {
      await inTx(async (tx, ctx) => {
        const parent = await addTask(tx, ctx, "Padre");
        const child = await addTask(tx, ctx, "Hija", {
          parentTaskId: parent.id,
        });
        await expect(
          createSubtask(child.id, { title: "Nieta" }, ctx.staffId),
        ).rejects.toThrow("TASK_NESTED");
      });
    });

    it("refuses a missing or deleted parent with TASK_NOT_FOUND", async () => {
      await inTx(async (tx, ctx) => {
        const gone = await addTask(tx, ctx, "Borrada", {
          deletedAt: new Date(),
        });
        await expect(
          createSubtask(gone.id, { title: "x" }, ctx.staffId),
        ).rejects.toThrow("TASK_NOT_FOUND");
        await expect(
          createSubtask(
            "00000000-0000-4000-8000-000000000000",
            { title: "x" },
            ctx.staffId,
          ),
        ).rejects.toThrow("TASK_NOT_FOUND");
      });
    });

    it("lets a child whose parent is gone act as top-level", async () => {
      await inTx(async (tx, ctx) => {
        // A parent deleted before subtasks followed it (#1041): the child was left live.
        const parent = await addTask(tx, ctx, "Padre", { deletedAt: new Date() });
        const child = await addTask(tx, ctx, "Hija", {
          parentTaskId: parent.id,
        });

        // The child keeps its row; it no longer reads as a subtask.
        const rows = await listTasks({ projectId: ctx.projectId }, VIEWER);
        expect(rows.map((r) => r.title)).toEqual(["Hija"]);
        expect(rows[0].parentTitle).toBeNull();

        const grandchild = await createSubtask(
          child.id,
          { title: "Nieta" },
          ctx.staffId,
        );
        expect(grandchild.parentTaskId).toBe(child.id);
      });
    });
  });

  describe("listSubtasks", () => {
    it("returns live children as TaskRef, without deleted or archived ones", async () => {
      await inTx(async (tx, ctx) => {
        const parent = await addTask(tx, ctx, "Padre");
        const a = await addTask(tx, ctx, "A", {
          parentTaskId: parent.id,
          status: "en_proceso",
          commitmentDate: "2026-11-02",
          sortOrder: 1,
        });
        await addTask(tx, ctx, "B", {
          parentTaskId: parent.id,
          managerId: null,
          sortOrder: 2,
        });
        await addTask(tx, ctx, "Borrada", {
          parentTaskId: parent.id,
          deletedAt: new Date(),
        });
        await addTask(tx, ctx, "Archivada", {
          parentTaskId: parent.id,
          archived: true,
        });
        await addTask(tx, ctx, "Otra");

        const refs = await listSubtasks(parent.id, VIEWER);
        expect(refs).toEqual([
          {
            id: a.id,
            title: "A",
            status: "en_proceso",
            managerName: "Ana Prueba",
            commitmentDate: "2026-11-02",
          },
          expect.objectContaining({
            title: "B",
            managerName: null,
            commitmentDate: null,
          }),
        ]);
      });
    });
  });

  describe("mergeTasks", () => {
    it("still moves checklist, support and history and soft-deletes the duplicates", async () => {
      await inTx(async (tx, ctx) => {
        const [helper] = await tx
          .insert(schema.staff)
          .values({ name: "Beto Apoyo" })
          .returning();
        const keep = await addTask(tx, ctx, "Original");
        const dup = await addTask(tx, ctx, "Duplicada");
        await tx.insert(schema.taskSupport).values([
          { taskId: keep.id, staffId: ctx.staffId },
          { taskId: dup.id, staffId: ctx.staffId },
          { taskId: dup.id, staffId: helper.id },
        ]);
        await tx
          .insert(schema.taskChecklistItems)
          .values({ taskId: dup.id, title: "Punto", sortOrder: 0 });
        await tx.insert(schema.historyEvents).values({
          entity: "task",
          entityId: dup.id,
          kind: "comentario",
          comment: "Nota vieja",
        });

        const merged = await mergeTasks(keep.id, [dup.id], ctx.staffId);

        expect(merged.support.map((s) => s.name).sort()).toEqual([
          "Ana Prueba",
          "Beto Apoyo",
        ]);
        expect(merged.checklistItems.map((c) => c.title)).toEqual(["Punto"]);
        expect(merged.history.some((h) => h.comment === "Nota vieja")).toBe(
          true,
        );
        expect(
          merged.history.some((h) => h.comment?.startsWith("Fusión:")),
        ).toBe(true);
        const [dupRow] = await tx
          .select()
          .from(schema.tasks)
          .where(eq(schema.tasks.id, dup.id));
        expect(dupRow.deletedAt).not.toBeNull();
      });
    });

    it("moves the duplicate's children under the surviving task", async () => {
      await inTx(async (tx, ctx) => {
        const keep = await addTask(tx, ctx, "Original");
        const dup = await addTask(tx, ctx, "Duplicada");
        const own = await addTask(tx, ctx, "Hija propia", {
          parentTaskId: keep.id,
        });
        const moved = await addTask(tx, ctx, "Hija movida", {
          parentTaskId: dup.id,
        });

        await mergeTasks(keep.id, [dup.id], ctx.staffId);

        expect(await parentOf(tx, own.id)).toBe(keep.id);
        expect(await parentOf(tx, moved.id)).toBe(keep.id);
        expect(
          (await listSubtasks(keep.id, VIEWER)).map((r) => r.title).sort(),
        ).toEqual(["Hija movida", "Hija propia"]);
      });
    });

    it("makes the children top-level when the survivor is itself a subtask", async () => {
      await inTx(async (tx, ctx) => {
        const top = await addTask(tx, ctx, "Padre");
        const keep = await addTask(tx, ctx, "Original", {
          parentTaskId: top.id,
        });
        const dup = await addTask(tx, ctx, "Duplicada");
        const child = await addTask(tx, ctx, "Hija", { parentTaskId: dup.id });

        await mergeTasks(keep.id, [dup.id], ctx.staffId);

        expect(await parentOf(tx, keep.id)).toBe(top.id);
        expect(await parentOf(tx, child.id)).toBeNull();
      });
    });

    it("makes the survivor top-level when it was a child of a merged duplicate", async () => {
      await inTx(async (tx, ctx) => {
        const dup = await addTask(tx, ctx, "Duplicada");
        const keep = await addTask(tx, ctx, "Original", {
          parentTaskId: dup.id,
        });
        const sibling = await addTask(tx, ctx, "Hermana", {
          parentTaskId: dup.id,
        });

        await mergeTasks(keep.id, [dup.id], ctx.staffId);

        expect(await parentOf(tx, keep.id)).toBeNull();
        expect(await parentOf(tx, sibling.id)).toBe(keep.id);
      });
    });

    it("moves dependencies on both sides to the survivor, dropping self-pairs and repeats", async () => {
      await inTx(async (tx, ctx) => {
        const keep = await addTask(tx, ctx, "Original");
        const dup = await addTask(tx, ctx, "Duplicada");
        const x = await addTask(tx, ctx, "X");
        const y = await addTask(tx, ctx, "Y");
        const z = await addTask(tx, ctx, "Z");
        await tx.insert(schema.taskDependencies).values([
          { taskId: keep.id, dependsOnTaskId: x.id }, // kept
          { taskId: dup.id, dependsOnTaskId: x.id }, // repeat of keep>x → dropped
          { taskId: dup.id, dependsOnTaskId: y.id }, // → keep>y
          { taskId: z.id, dependsOnTaskId: dup.id }, // → z>keep
          { taskId: keep.id, dependsOnTaskId: dup.id }, // → keep>keep → dropped
        ]);

        await mergeTasks(keep.id, [dup.id], ctx.staffId);

        expect(await depsOf(tx, [keep.id, dup.id])).toEqual(
          [
            `${keep.id}>${x.id}`,
            `${keep.id}>${y.id}`,
            `${z.id}>${keep.id}`,
          ].sort(),
        );
        const rows = await listTasks({ projectId: ctx.projectId }, VIEWER);
        expect(rows.find((r) => r.id === keep.id)?.waitingOn).toBe(2);
      });
    });

    it("dedupes dependencies shared by several duplicates", async () => {
      await inTx(async (tx, ctx) => {
        const keep = await addTask(tx, ctx, "Original");
        const d1 = await addTask(tx, ctx, "Duplicada 1");
        const d2 = await addTask(tx, ctx, "Duplicada 2");
        const x = await addTask(tx, ctx, "X");
        await tx.insert(schema.taskDependencies).values([
          { taskId: d1.id, dependsOnTaskId: x.id },
          { taskId: d2.id, dependsOnTaskId: x.id },
          { taskId: x.id, dependsOnTaskId: d1.id },
          { taskId: x.id, dependsOnTaskId: d2.id },
          { taskId: d1.id, dependsOnTaskId: d2.id },
        ]);

        await mergeTasks(keep.id, [d1.id, d2.id], ctx.staffId);

        expect(await depsOf(tx, [keep.id, d1.id, d2.id])).toEqual(
          [`${keep.id}>${x.id}`, `${x.id}>${keep.id}`].sort(),
        );
        const left = await tx
          .select()
          .from(schema.taskDependencies)
          .where(
            and(
              inArray(schema.taskDependencies.taskId, [d1.id, d2.id]),
              inArray(schema.taskDependencies.dependsOnTaskId, [d1.id, d2.id]),
            ),
          );
        expect(left).toHaveLength(0);
      });
    });
  });

  describe("softDeleteTask and restoreTask (#1041)", () => {
    async function deletedAtOf(tx: Tx, ids: string[]) {
      const rows = await tx
        .select({ id: schema.tasks.id, deletedAt: schema.tasks.deletedAt })
        .from(schema.tasks)
        .where(inArray(schema.tasks.id, ids));
      return new Map(rows.map((r) => [r.id, r.deletedAt]));
    }

    it("deletes the live subtasks with the parent and restores exactly those", async () => {
      await inTx(async (tx, ctx) => {
        const parent = await addTask(tx, ctx, "Padre");
        const child = await addTask(tx, ctx, "Hija", { parentTaskId: parent.id });
        const earlier = new Date(Date.now() - 60_000);
        const gone = await addTask(tx, ctx, "Borrada antes", { parentTaskId: parent.id, deletedAt: earlier });
        await addTask(tx, ctx, "Otra");

        await softDeleteTask(parent.id, ctx.staffId);
        const deleted = await deletedAtOf(tx, [parent.id, child.id, gone.id]);
        expect(deleted.get(parent.id)).not.toBeNull();
        expect(deleted.get(child.id)?.getTime()).toBe(deleted.get(parent.id)?.getTime());
        expect(deleted.get(gone.id)?.getTime()).toBe(earlier.getTime());
        expect((await listTasks({ projectId: ctx.projectId }, VIEWER)).map((r) => r.title)).toEqual(["Otra"]);

        await restoreTask(parent.id, { staffId: ctx.staffId, isAdmin: false });
        const restored = await deletedAtOf(tx, [parent.id, child.id, gone.id]);
        expect(restored.get(parent.id)).toBeNull();
        expect(restored.get(child.id)).toBeNull();
        // Deleted on its own before: stays deleted.
        expect(restored.get(gone.id)?.getTime()).toBe(earlier.getTime());

        const events = await tx
          .select({ entityId: schema.historyEvents.entityId, after: schema.historyEvents.afterValue })
          .from(schema.historyEvents)
          .where(
            and(
              inArray(schema.historyEvents.entityId, [parent.id, child.id]),
              eq(schema.historyEvents.field, "deleted"),
            ),
          );
        expect(events.filter((e) => e.entityId === parent.id).map((e) => e.after).sort()).toEqual(["false", "true"]);
        expect(events.filter((e) => e.entityId === child.id).map((e) => e.after).sort()).toEqual(["false", "true"]);
      });
    });

    it("lets only an admin or the person who deleted it restore", async () => {
      await inTx(async (tx, ctx) => {
        const [other] = await tx.insert(schema.staff).values({ name: "Otra Persona" }).returning();
        const task = await addTask(tx, ctx, "Tarea");
        await softDeleteTask(task.id, ctx.staffId);

        await expect(restoreTask(task.id, { staffId: other.id, isAdmin: false })).rejects.toThrow(/^FORBIDDEN/);
        await restoreTask(task.id, { staffId: other.id, isAdmin: true });
        expect((await deletedAtOf(tx, [task.id])).get(task.id)).toBeNull();
      });
    });

    it("refuses a live task and one deleted more than 30 days ago", async () => {
      await inTx(async (tx, ctx) => {
        const live = await addTask(tx, ctx, "Viva");
        await expect(restoreTask(live.id, { staffId: ctx.staffId, isAdmin: true })).rejects.toThrow(/^NOT_FOUND/);

        const old = await addTask(tx, ctx, "Vieja");
        await softDeleteTask(old.id, ctx.staffId);
        const later = new Date(Date.now() + TASK_RESTORE_WINDOW_MS + 60_000);
        await expect(restoreTask(old.id, { staffId: ctx.staffId, isAdmin: true }, later)).rejects.toThrow(/^INVALID/);
      });
    });
  });
});
