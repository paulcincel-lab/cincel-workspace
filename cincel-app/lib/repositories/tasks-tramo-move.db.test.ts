// @vitest-environment node
/**
 * Moving a task to another tramo through `updateTask` against a real Postgres
 * (#1022): admins only, fase reset, subtasks moving along and the history
 * entry, all in one transaction. Runs only when TEST_DATABASE_URL points at a
 * migrated database (`npm run db:migrate`). Every row a test creates carries
 * a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TASK_TRAMO_CHANGE_FORBIDDEN } from "@/lib/project-flow/errors";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("tasks repository: tramo move (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/tasks-repository");

  let actorId = "";
  let projectId = "";
  let diseno = "";
  let construccion = "";
  let deleted = "";
  let faseDiseno = "";
  let faseConstruccion = "";
  const workflowIds: string[] = [];

  async function task(values: Partial<typeof schema.tasks.$inferInsert> = {}) {
    const [row] = await db
      .insert(schema.tasks)
      .values({
        projectId,
        kind: "usuario",
        title: `Tarea ${run}`,
        createdById: actorId,
        workflowId: diseno,
        phaseId: faseDiseno,
        ...values,
      })
      .returning();
    return row!;
  }

  async function load(id: string) {
    const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return row!;
  }

  async function history(id: string) {
    return db
      .select()
      .from(schema.historyEvents)
      .where(and(eq(schema.historyEvents.entity, "task"), eq(schema.historyEvents.entityId, id)));
  }

  beforeAll(async () => {
    const [actor] = await db
      .insert(schema.staff)
      .values({ name: `Admin ${run}`, role: "Administrador" })
      .returning({ id: schema.staff.id });
    actorId = actor!.id;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Tramo move ${run}` })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
    const flows = await db
      .insert(schema.workflows)
      .values([
        { key: `diseno-${run}`, name: "Diseño" },
        { key: `construccion-${run}`, name: "Construcción" },
        { key: `borrado-${run}`, name: "Borrado", deletedAt: new Date() },
      ])
      .returning({ id: schema.workflows.id });
    [diseno, construccion, deleted] = flows.map((f) => f!.id) as [string, string, string];
    workflowIds.push(diseno, construccion, deleted);
    const fases = await db
      .insert(schema.workflowPhases)
      .values([
        { workflowId: diseno, name: `Anteproyecto ${run}` },
        { workflowId: construccion, name: `Obra negra ${run}` },
      ])
      .returning({ id: schema.workflowPhases.id });
    [faseDiseno, faseConstruccion] = fases.map((f) => f!.id) as [string, string];
  });

  afterAll(async () => {
    const all = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId));
    const ids = all.map((r) => r.id);
    if (ids.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids));
      await db.update(schema.tasks).set({ parentTaskId: null }).where(inArray(schema.tasks.id, ids));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids));
    }
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workflowPhases).where(inArray(schema.workflowPhases.workflowId, workflowIds));
    await db.delete(schema.workflows).where(inArray(schema.workflows.id, workflowIds));
    await db.delete(schema.staff).where(eq(schema.staff.id, actorId));
  });

  it("refuses a move without canMoveTramo and writes nothing", async () => {
    const t = await task();
    await expect(repo.updateTask(t.id, { workflowId: construccion }, actorId)).rejects.toThrow(
      TASK_TRAMO_CHANGE_FORBIDDEN
    );
    expect(await load(t.id)).toMatchObject({ workflowId: diseno, phaseId: faseDiseno });
    expect(await history(t.id)).toHaveLength(0);
  });

  it("moves Diseño → Construcción, clears the fase and records the move by name", async () => {
    const t = await task();
    const moved = await repo.updateTask(t.id, { workflowId: construccion }, actorId, { canMoveTramo: true });
    expect(moved).toMatchObject({ workflowId: construccion, phaseId: null });
    const events = await history(t.id);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "tramo", beforeValue: "Diseño", afterValue: "Construcción", actorId }),
        expect.objectContaining({ field: "phaseId", beforeValue: faseDiseno, afterValue: null }),
      ])
    );
    expect(events.some((e) => e.field === "workflowId")).toBe(false);
  });

  it("keeps a fase of the new tramo set in the same patch", async () => {
    const t = await task();
    const moved = await repo.updateTask(
      t.id,
      { workflowId: construccion, phaseId: faseConstruccion },
      actorId,
      { canMoveTramo: true }
    );
    expect(moved).toMatchObject({ workflowId: construccion, phaseId: faseConstruccion });
  });

  it("rejects a fase of the old tramo in the same patch as PHASE_MISMATCH", async () => {
    const t = await task();
    await expect(
      repo.updateTask(t.id, { workflowId: construccion, phaseId: faseDiseno }, actorId, { canMoveTramo: true })
    ).rejects.toThrow(/^PHASE_MISMATCH/);
  });

  it("moves the subtasks with the parent", async () => {
    const parent = await task();
    const follows = await task({ parentTaskId: parent.id, title: `Hija 1 ${run}` });
    const noFase = await task({ parentTaskId: parent.id, phaseId: null, title: `Hija 2 ${run}` });
    const gone = await task({ parentTaskId: parent.id, title: `Borrada ${run}`, deletedAt: new Date() });

    await repo.updateTask(parent.id, { workflowId: construccion, phaseId: faseConstruccion }, actorId, {
      canMoveTramo: true,
    });

    // The child on the parent's old fase follows it to the new fase; one without a fase stays without.
    expect(await load(follows.id)).toMatchObject({ workflowId: construccion, phaseId: faseConstruccion });
    expect(await load(noFase.id)).toMatchObject({ workflowId: construccion, phaseId: null });
    expect(await load(gone.id)).toMatchObject({ workflowId: diseno, phaseId: faseDiseno });
    expect(await history(follows.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "tramo", beforeValue: "Diseño", afterValue: "Construcción" }),
      ])
    );
  });

  it("rejects an unknown or deleted tramo, or clearing it, as INVALID", async () => {
    const t = await task();
    const opts = { canMoveTramo: true };
    await expect(repo.updateTask(t.id, { workflowId: randomUUID() }, actorId, opts)).rejects.toThrow(/^INVALID/);
    await expect(repo.updateTask(t.id, { workflowId: deleted }, actorId, opts)).rejects.toThrow(/^INVALID/);
    await expect(repo.updateTask(t.id, { workflowId: null }, actorId, opts)).rejects.toThrow(/^INVALID/);
    expect(await load(t.id)).toMatchObject({ workflowId: diseno, phaseId: faseDiseno });
  });

  it("still lets a task writer set a tramo on a task without one", async () => {
    const t = await task({ workflowId: null, phaseId: null });
    await expect(repo.updateTask(t.id, { workflowId: diseno }, actorId)).resolves.toMatchObject({
      workflowId: diseno,
    });
  });

  it("rejects a tramo on an admin task as ADMIN_TASK", async () => {
    const t = await task({ kind: "admin", workflowId: null, phaseId: null });
    await expect(repo.updateTask(t.id, { workflowId: construccion }, actorId, { canMoveTramo: true })).rejects.toThrow(
      /^ADMIN_TASK$/
    );
  });
});
