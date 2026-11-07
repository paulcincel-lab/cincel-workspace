// @vitest-environment node
/**
 * Iniciar tramo against a real Postgres (BE §9.6-§9.8, §16): assignment
 * modes, idempotent repeats, concurrent starts, undo and the touched rule,
 * and auto-start on ready. Runs only when TEST_DATABASE_URL points at a
 * migrated database. Every row is created under per-run tramos (random keys)
 * and deleted afterwards; READINESS is pointed at those keys.
 */
import { randomUUID } from "node:crypto";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";

const url = process.env.TEST_DATABASE_URL;
const run = randomUUID().slice(0, 8);

const keys = vi.hoisted(() => {
  const id = Math.random().toString(36).slice(2, 10);
  return { first: `t_first_${id}`, second: `t_second_${id}` };
});

vi.mock("./catalog", async (importOriginal) => {
  const real = await importOriginal<typeof import("./catalog")>();
  return { ...real, READINESS: { [keys.second]: { after: keys.first, phaseKey: "gate" } } };
});

vi.mock("@/lib/repositories/positions-repository", () => ({
  listCandidates: async (_db: unknown, phaseIds: string[]) => new Map(phaseIds.map((id) => [id, []])),
}));

describe.skipIf(!url)("startTramo / undoStartTramo / onTaskClosingChanged (test DB)", async () => {
  const client = postgres(url ?? "", { max: 4 });
  const db = drizzle(client, { schema });
  const flow = await import("./start-tramo");
  const auto = await import("./auto-start");
  const { projectStages, projects, staff, taskChecklistItems, tasks, tramoStartBatches, workflowPhases, workflows, workflowTaskTemplates, historyEvents } =
    schema;

  let actorId = "";
  let otherId = "";
  const wf = { first: "", second: "" };
  const phases: Record<string, string> = {};
  const projectIds: string[] = [];

  async function newProject(startDate: string | null = "2026-01-10"): Promise<string> {
    const [p] = await db
      .insert(projects)
      .values({ name: `Flujo ${run} ${projectIds.length}`, startDate })
      .returning({ id: projects.id });
    projectIds.push(p.id);
    return p.id;
  }

  const start = (params: Partial<Parameters<typeof flow.startTramo>[1]> & { projectId: string }) =>
    db.transaction((tx) =>
      flow.startTramo(tx, {
        workflowId: wf.first,
        phaseIds: [phases.a, phases.b],
        assignment: { mode: "none" },
        actorId,
        trigger: "manual",
        ...params,
      })
    );

  const liveTasks = (projectId: string) =>
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));

  beforeAll(async () => {
    const [a, b] = await db
      .insert(staff)
      .values([{ name: `Inicio ${run} A` }, { name: `Inicio ${run} B` }])
      .returning({ id: staff.id });
    actorId = a.id;
    otherId = b.id;

    const [w1, w2] = await db
      .insert(workflows)
      .values([
        { key: keys.first, name: `Primero ${run}`, sortOrder: 9001 },
        { key: keys.second, name: `Segundo ${run}`, sortOrder: 9002 },
      ])
      .returning({ id: workflows.id });
    wf.first = w1.id;
    wf.second = w2.id;

    const rows = await db
      .insert(workflowPhases)
      .values([
        { workflowId: wf.first, name: "Fase A", sortOrder: 0 },
        { workflowId: wf.first, name: "Fase B", sortOrder: 1, key: "gate" },
        { workflowId: wf.first, name: "Fase inactiva", sortOrder: 2, active: false },
        { workflowId: wf.second, name: "Fase C", sortOrder: 0 },
      ])
      .returning({ id: workflowPhases.id, name: workflowPhases.name });
    phases.a = rows[0].id;
    phases.b = rows[1].id;
    phases.inactive = rows[2].id;
    phases.c = rows[3].id;

    await db.insert(workflowTaskTemplates).values([
      { workflowId: wf.first, phaseId: phases.a, title: "A1", sortOrder: 0, commitmentOffsetDays: 3 },
      { workflowId: wf.first, phaseId: phases.a, title: "A2", sortOrder: 1 },
      { workflowId: wf.first, phaseId: phases.b, title: "B1", sortOrder: 2, reviewOffsetDays: 5 },
      { workflowId: wf.second, phaseId: phases.c, title: "C1", sortOrder: 0 },
      { workflowId: wf.second, phaseId: phases.c, title: "C2", sortOrder: 1 },
    ]);
  });

  afterAll(async () => {
    if (projectIds.length > 0) {
      const taskIds = (await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.projectId, projectIds))).map(
        (t) => t.id
      );
      if (taskIds.length > 0) {
        await db.delete(historyEvents).where(inArray(historyEvents.entityId, taskIds));
      }
      await db.delete(historyEvents).where(inArray(historyEvents.entityId, projectIds));
      await db.delete(tasks).where(inArray(tasks.projectId, projectIds));
      await db.delete(projects).where(inArray(projects.id, projectIds));
    }
    await db.delete(historyEvents).where(inArray(historyEvents.entityId, [wf.first, wf.second]));
    await db.delete(workflowTaskTemplates).where(inArray(workflowTaskTemplates.workflowId, [wf.first, wf.second]));
    await db.delete(workflowPhases).where(inArray(workflowPhases.workflowId, [wf.first, wf.second]));
    await db.delete(workflows).where(inArray(workflows.id, [wf.first, wf.second]));
    await db.delete(staff).where(inArray(staff.id, [actorId, otherId]));
    await client.end();
  });

  it("previews the templates still to create per active fase", async () => {
    const projectId = await newProject();
    const preview = await flow.previewStartTramo(db, projectId, wf.first);
    expect(preview.alreadyStarted).toBe(false);
    expect(preview.autoStart).toBe(false);
    expect(preview.phases.map((p) => p.phase.name)).toEqual(["Fase A", "Fase B"]);
    expect(preview.phases[0].templates.map((t) => t.title)).toEqual(["A1", "A2"]);

    await start({ projectId, phaseIds: [phases.a] });
    const after = await flow.previewStartTramo(db, projectId, wf.first);
    expect(after.alreadyStarted).toBe(true);
    expect(after.phases[0]).toMatchObject({ templates: [], existing: 2 });
    expect(after.phases[1].templates.map((t) => t.title)).toEqual(["B1"]);
  });

  it("creates the tasks with stage, batch, current tramo and dates", async () => {
    const projectId = await newProject();
    const result = await start({ projectId });
    expect(result).toMatchObject({ createdCount: 3, skippedCount: 0, stageCreated: true });
    expect(result.batchId).not.toBeNull();

    const created = await liveTasks(projectId);
    expect(created).toHaveLength(3);
    expect(created.every((t) => t.kind === "workflow" && t.startBatchId === result.batchId)).toBe(true);
    expect(created.every((t) => t.managerId === null)).toBe(true);
    const a1 = created.find((t) => t.title === "A1")!;
    expect(a1.phaseId).toBe(phases.a);
    expect(a1.commitmentDate).toBe("2026-01-13");
    expect(created.find((t) => t.title === "B1")!.reviewDate).toBe("2026-01-15");

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project.currentWorkflowId).toBe(wf.first);
    const stages = await db.select().from(projectStages).where(eq(projectStages.projectId, projectId));
    expect(stages).toHaveLength(1);
  });

  it("assigns per mode: self and by_phase", async () => {
    const selfProject = await newProject();
    await start({ projectId: selfProject, assignment: { mode: "self" } });
    expect((await liveTasks(selfProject)).every((t) => t.managerId === actorId)).toBe(true);

    const byPhase = await newProject();
    await start({
      projectId: byPhase,
      assignment: { mode: "by_phase", managers: { [phases.a]: otherId, [phases.b]: null } },
    });
    const rows = await liveTasks(byPhase);
    expect(rows.filter((t) => t.phaseId === phases.a).every((t) => t.managerId === otherId)).toBe(true);
    expect(rows.find((t) => t.phaseId === phases.b)!.managerId).toBeNull();
  });

  it("returns createdCount 0 on a repeated start", async () => {
    const projectId = await newProject();
    await start({ projectId });
    const again = await start({ projectId });
    expect(again).toMatchObject({ createdCount: 0, skippedCount: 3, stageCreated: false, batchId: null });
    expect(await liveTasks(projectId)).toHaveLength(3);
    const batches = await db.select().from(tramoStartBatches).where(eq(tramoStartBatches.projectId, projectId));
    expect(batches).toHaveLength(1);
  });

  it("creates each task once under concurrent starts", async () => {
    const projectId = await newProject();
    const results = await Promise.all([start({ projectId }), start({ projectId }), start({ projectId })]);
    expect(results.reduce((n, r) => n + r.createdCount, 0)).toBe(3);
    expect(results.filter((r) => r.stageCreated)).toHaveLength(1);
    expect(await liveTasks(projectId)).toHaveLength(3);
  });

  it("refuses empty and foreign fases", async () => {
    const projectId = await newProject();
    await expect(start({ projectId, phaseIds: [] })).rejects.toThrow("NO_PHASES");
    await expect(start({ projectId, phaseIds: [phases.c] })).rejects.toThrow("PHASE_MISMATCH");
    await expect(start({ projectId, phaseIds: [phases.inactive] })).rejects.toThrow("PHASE_MISMATCH");
    await expect(start({ projectId: randomUUID() })).rejects.toThrow("NOT_FOUND");
  });

  it("moves the current tramo forward only", async () => {
    const projectId = await newProject();
    await start({ projectId, workflowId: wf.second, phaseIds: [phases.c] });
    await start({ projectId });
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project.currentWorkflowId).toBe(wf.second);
  });

  it("undoes an untouched batch: tasks, stage and current tramo", async () => {
    const projectId = await newProject();
    const result = await start({ projectId });
    expect(await flow.isBatchTouched(db, result.batchId!)).toBe(false);

    await db.transaction((tx) => flow.undoStartTramo(tx, result.batchId!, actorId));

    expect(await liveTasks(projectId)).toHaveLength(0);
    expect(await db.select().from(projectStages).where(eq(projectStages.projectId, projectId))).toHaveLength(0);
    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    expect(project.currentWorkflowId).toBeNull();
    const [batch] = await db.select().from(tramoStartBatches).where(eq(tramoStartBatches.id, result.batchId!));
    expect(batch.undoneAt).not.toBeNull();
    await expect(db.transaction((tx) => flow.undoStartTramo(tx, result.batchId!, actorId))).rejects.toThrow(
      "NOT_FOUND"
    );

    // The template slots are free again.
    expect((await start({ projectId })).createdCount).toBe(3);
  });

  it("returns TOUCHED after a title edit", async () => {
    const projectId = await newProject();
    const result = await start({ projectId });
    const [first] = await liveTasks(projectId);
    await db.update(tasks).set({ title: "Editada" }).where(eq(tasks.id, first.id));

    expect(await flow.isBatchTouched(db, result.batchId!)).toBe(true);
    await expect(db.transaction((tx) => flow.undoStartTramo(tx, result.batchId!, actorId))).rejects.toThrow(
      "TOUCHED"
    );
    expect(await liveTasks(projectId)).toHaveLength(3);
  });

  it("returns TOUCHED after a checklist item or a comment", async () => {
    const withItem = await newProject();
    const r1 = await start({ projectId: withItem });
    const [t1] = await liveTasks(withItem);
    await db.insert(taskChecklistItems).values({ taskId: t1.id, title: "Paso" });
    expect(await flow.isBatchTouched(db, r1.batchId!)).toBe(true);

    const withComment = await newProject();
    const r2 = await start({ projectId: withComment });
    const [t2] = await liveTasks(withComment);
    await db
      .insert(historyEvents)
      .values({ entity: "task", entityId: t2.id, kind: "comentario", actorId, comment: "Hola" });
    expect(await flow.isBatchTouched(db, r2.batchId!)).toBe(true);
  });

  it("refuses to undo a batch with a later live batch", async () => {
    const projectId = await newProject();
    const r1 = await start({ projectId, phaseIds: [phases.a] });
    const r2 = await start({ projectId, phaseIds: [phases.b] });
    await expect(db.transaction((tx) => flow.undoStartTramo(tx, r1.batchId!, actorId))).rejects.toThrow("TOUCHED");
    await db.transaction((tx) => flow.undoStartTramo(tx, r2.batchId!, actorId));
    // The stage was opened by the first batch: it stays.
    expect(await db.select().from(projectStages).where(eq(projectStages.projectId, projectId))).toHaveLength(1);
  });

  describe("onTaskClosingChanged", () => {
    async function completeGate(projectId: string) {
      await db
        .update(tasks)
        .set({ status: "completado", closedAt: new Date() })
        .where(and(eq(tasks.projectId, projectId), eq(tasks.phaseId, phases.b)));
    }
    const stageOf = (projectId: string, workflowId: string) =>
      db
        .select()
        .from(projectStages)
        .where(and(eq(projectStages.projectId, projectId), eq(projectStages.workflowId, workflowId)));

    it("does not start the next tramo while it is manual", async () => {
      await db.update(workflows).set({ autoStart: "manual" }).where(eq(workflows.id, wf.second));
      const projectId = await newProject();
      await start({ projectId });
      await completeGate(projectId);
      await auto.onTaskClosingChanged(db, projectId, wf.first, actorId);
      expect(await stageOf(projectId, wf.second)).toHaveLength(0);
    });

    it("waits for the gate fase, then starts on_ready once", async () => {
      await db.update(workflows).set({ autoStart: "on_ready" }).where(eq(workflows.id, wf.second));
      try {
        const projectId = await newProject();
        await start({ projectId });

        await auto.onTaskClosingChanged(db, projectId, wf.first, actorId);
        expect(await stageOf(projectId, wf.second)).toHaveLength(0);

        await completeGate(projectId);
        await Promise.all([
          auto.onTaskClosingChanged(db, projectId, wf.first, actorId),
          auto.onTaskClosingChanged(db, projectId, wf.first, actorId),
        ]);
        expect(await stageOf(projectId, wf.second)).toHaveLength(1);
        const second = (await liveTasks(projectId)).filter((t) => t.workflowId === wf.second);
        expect(second.map((t) => t.title).sort()).toEqual(["C1", "C2"]);
        expect(second.every((t) => t.managerId === null)).toBe(true);
        const [batch] = await db
          .select()
          .from(tramoStartBatches)
          .where(and(eq(tramoStartBatches.projectId, projectId), eq(tramoStartBatches.workflowId, wf.second)));
        expect(batch.trigger).toBe("on_ready");

        // Fase A is still open: the first stage stays open.
        const [firstStage] = await stageOf(projectId, wf.first);
        expect(firstStage.closedAt).toBeNull();
      } finally {
        await db.update(workflows).set({ autoStart: "manual" }).where(eq(workflows.id, wf.second));
      }
    });
  });
});
