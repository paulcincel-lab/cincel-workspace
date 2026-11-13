// @vitest-environment node
/**
 * Task checklist → subtasks (#1046) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database. Every row it creates
 * carries a per-run marker and is deleted afterwards; each run is scoped to
 * this file's tasks (`taskIds`), so other files' checklist rows are untouched.
 *
 * - Items become subtasks of their task: title, done → completado (with
 *   closedAt), checklist order after the task's ordered subtasks, the task's
 *   creator, etapa and fase.
 * - A subtask's items go to its parent (one level of nesting); a subtask
 *   whose parent is deleted keeps them (it behaves as top-level).
 * - An admin task gets admin subtasks; a deleted task is not scanned; a task
 *   without items is not counted.
 * - Dry run counts and writes nothing; a second run converts nothing.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("convertChecklistToSubtasks (test DB)", async () => {
  const { and, asc, eq, inArray, isNotNull } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { convertChecklistToSubtasks } = await import("@/lib/repositories/task-checklist-conversion");

  let creatorId = "";
  let projectId = "";
  let workflowId = "";
  let phaseId = "";
  const t = { top: "", parent: "", child: "", goneParent: "", orphan: "", admin: "", empty: "", deleted: "" };
  let scope: string[] = [];

  const children = (parentId: string) =>
    db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.parentTaskId, parentId))
      .orderBy(asc(schema.tasks.sortOrder));

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Checklist ${run}`, lastName: "Prueba", email: `checklist-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    creatorId = member.id;

    const [workflow] = await db
      .insert(schema.workflows)
      .values({ key: `checklist-${run}`, name: `Etapa checklist ${run}`, sortOrder: 900 })
      .returning({ id: schema.workflows.id });
    workflowId = workflow.id;
    const [phase] = await db
      .insert(schema.workflowPhases)
      .values({ workflowId, name: `Fase ${run}`, sortOrder: 1 })
      .returning({ id: schema.workflowPhases.id });
    phaseId = phase.id;

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Checklist ${run}`, status: "activo", managerId: creatorId })
      .returning({ id: schema.projects.id });
    projectId = project.id;

    const base = { projectId, createdById: creatorId, kind: "usuario" as const };
    const insert = async (values: Partial<typeof schema.tasks.$inferInsert> & { title: string }) => {
      const [row] = await db
        .insert(schema.tasks)
        .values({ ...base, ...values })
        .returning({ id: schema.tasks.id });
      return row.id;
    };
    t.top = await insert({ title: `Planos ${run}`, workflowId, phaseId });
    // An ordered subtask already there: the converted ones go after it.
    await insert({ title: `Hija previa ${run}`, parentTaskId: t.top, workflowId, phaseId, sortOrder: 5 });
    t.parent = await insert({ title: `Obra ${run}` });
    t.child = await insert({ title: `Subtarea ${run}`, parentTaskId: t.parent });
    t.goneParent = await insert({ title: `Borrada madre ${run}`, deletedAt: new Date() });
    t.orphan = await insert({ title: `Huérfana ${run}`, parentTaskId: t.goneParent });
    t.admin = await insert({ title: `Cobranza ${run}`, kind: "admin" });
    t.empty = await insert({ title: `Vacía ${run}` });
    t.deleted = await insert({ title: `Eliminada ${run}`, deletedAt: new Date() });
    scope = Object.values(t);

    const doneAt = new Date("2026-10-01T12:00:00.000Z");
    await db.insert(schema.taskChecklistItems).values([
      { taskId: t.top, title: "Subir planos", sortOrder: 2 },
      { taskId: t.top, title: "Medir baños", sortOrder: 0, completed: true, updatedAt: doneAt },
      { taskId: t.top, title: "  Cotas  ", sortOrder: 1 },
      { taskId: t.child, title: "Pintar", sortOrder: 0 },
      { taskId: t.child, title: "Resanar", sortOrder: 1, completed: true },
      { taskId: t.orphan, title: "Limpiar", sortOrder: 0 },
      { taskId: t.admin, title: "Facturar", sortOrder: 0 },
      { taskId: t.deleted, title: "Nunca", sortOrder: 0 },
    ]);
  });

  afterAll(async () => {
    if (!projectId) return;
    // Project delete cascades to its tasks and their checklist rows.
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workflowPhases).where(eq(schema.workflowPhases.workflowId, workflowId));
    await db.delete(schema.workflows).where(eq(schema.workflows.id, workflowId));
    await db.delete(schema.staff).where(eq(schema.staff.id, creatorId));
  });

  it("an empty scope does nothing", async () => {
    expect(await convertChecklistToSubtasks({ taskIds: [] })).toEqual({
      tasksScanned: 0,
      itemsConverted: 0,
      itemsPromotedToParent: 0,
      itemsSkipped: 0,
    });
  });

  it("dry run reports what it would do and writes nothing", async () => {
    const before = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.projectId, projectId));
    const report = await convertChecklistToSubtasks({ dryRun: true, taskIds: scope });
    expect(report).toEqual({ tasksScanned: 4, itemsConverted: 5, itemsPromotedToParent: 2, itemsSkipped: 0 });
    const after = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.projectId, projectId));
    expect(after).toHaveLength(before.length);
    const marked = await db
      .select({ id: schema.taskChecklistItems.id })
      .from(schema.taskChecklistItems)
      .where(and(inArray(schema.taskChecklistItems.taskId, scope), isNotNull(schema.taskChecklistItems.convertedAt)));
    expect(marked).toEqual([]);
  });

  it("converts each item into a subtask of its task, in checklist order", async () => {
    const report = await convertChecklistToSubtasks({ taskIds: scope });
    expect(report).toEqual({ tasksScanned: 4, itemsConverted: 5, itemsPromotedToParent: 2, itemsSkipped: 0 });

    const top = await children(t.top);
    expect(top.map((c) => [c.title, c.status, c.sortOrder])).toEqual([
      [`Hija previa ${run}`, "pendiente", 5],
      ["Medir baños", "completado", 6],
      ["Cotas", "pendiente", 7],
      ["Subir planos", "pendiente", 8],
    ]);
    const converted = top.slice(1);
    for (const c of converted) {
      expect(c).toMatchObject({ kind: "usuario", projectId, workflowId, phaseId, createdById: creatorId, managerId: null });
      expect(c.closedAt === null).toBe(c.status !== "completado");
    }
    expect(converted[0].closedAt?.toISOString()).toBe("2026-10-01T12:00:00.000Z");

    // Each item records the subtask it became.
    const items = await db
      .select()
      .from(schema.taskChecklistItems)
      .where(eq(schema.taskChecklistItems.taskId, t.top))
      .orderBy(asc(schema.taskChecklistItems.sortOrder));
    expect(items.map((i) => i.convertedTaskId)).toEqual(converted.map((c) => c.id));
    expect(items.every((i) => i.convertedAt !== null)).toBe(true);
  });

  it("promotes a subtask's items to its parent (one level of nesting)", async () => {
    expect(await children(t.child)).toEqual([]);
    // The promoted items in checklist order; the unordered subtask (null sortOrder) sorts last, as in the sheet.
    const siblings = await children(t.parent);
    expect(siblings.map((c) => [c.title, c.status, c.parentTaskId])).toEqual([
      ["Pintar", "pendiente", t.parent],
      ["Resanar", "completado", t.parent],
      [`Subtarea ${run}`, "pendiente", t.parent],
    ]);
  });

  it("keeps the items on a subtask whose parent is deleted", async () => {
    expect((await children(t.orphan)).map((c) => c.title)).toEqual(["Limpiar"]);
  });

  it("gives an admin task admin subtasks without etapa or fase", async () => {
    const [sub] = await children(t.admin);
    expect(sub).toMatchObject({ title: "Facturar", kind: "admin", workflowId: null, phaseId: null, spaceId: null });
  });

  it("skips deleted tasks and tasks without items", async () => {
    expect(await children(t.deleted)).toEqual([]);
    expect(await children(t.empty)).toEqual([]);
    const [item] = await db
      .select()
      .from(schema.taskChecklistItems)
      .where(eq(schema.taskChecklistItems.taskId, t.deleted));
    expect(item.convertedAt).toBeNull();
  });

  it("is idempotent: a second run converts nothing", async () => {
    const count = async () =>
      (
        await db
          .select({ id: schema.tasks.id })
          .from(schema.tasks)
          .where(inArray(schema.tasks.parentTaskId, [t.top, t.parent, t.orphan, t.admin]))
      ).length;
    const before = await count();
    const report = await convertChecklistToSubtasks({ taskIds: scope });
    expect(report).toEqual({ tasksScanned: 4, itemsConverted: 0, itemsPromotedToParent: 0, itemsSkipped: 7 });
    expect(await count()).toBe(before);
  });
});
