// @vitest-environment node
/**
 * Project create and current tramo against a real Postgres (project flow BE
 * §8.5, §9.4). `startTramo` is replaced by a spy: these tests check what the
 * repository asks of it (on create: the first tramo with every active fase,
 * unassigned; "Asignar tramo": `stageOnly`), not the start itself. Runs only
 * when TEST_DATABASE_URL points at a migrated database; every row a test
 * creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const startTramo = vi.hoisted(() => vi.fn());
vi.mock("@/lib/project-flow/start-tramo", () => ({ startTramo }));

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("projects repository (test DB)", async () => {
  const { and, asc, eq, inArray, isNull } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("./projects-repository");

  const ids = { staff: [] as string[], contacts: [] as string[], projects: [] as string[], workflows: [] as string[] };
  let actorId = "";
  let clientId = "";
  /** The first active tramo, with its auto-start restored afterwards. */
  let first: { id: string; autoStart: "on_create" | "on_ready" | "manual" } | null = null;
  let firstPhaseIds: string[] = [];
  let otherTramoId = "";

  beforeAll(async () => {
    const [actor] = await db
      .insert(schema.staff)
      .values({ name: `Admin ${run}`, email: `admin-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    actorId = actor.id;
    ids.staff.push(actor.id);

    const [contact] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente ${run}` })
      .returning({ id: schema.contacts.id });
    clientId = contact.id;
    ids.contacts.push(contact.id);

    const [row] = await db
      .select({ id: schema.workflows.id, autoStart: schema.workflows.autoStart })
      .from(schema.workflows)
      .where(and(eq(schema.workflows.active, true), isNull(schema.workflows.deletedAt)))
      .orderBy(asc(schema.workflows.sortOrder), asc(schema.workflows.name))
      .limit(1);
    first = row ?? null;
    if (first) {
      const phases = await db
        .select({ id: schema.workflowPhases.id })
        .from(schema.workflowPhases)
        .where(and(eq(schema.workflowPhases.workflowId, first.id), eq(schema.workflowPhases.active, true)))
        .orderBy(asc(schema.workflowPhases.sortOrder), asc(schema.workflowPhases.name));
      firstPhaseIds = phases.map((p) => p.id);
    }

    const [other] = await db
      .insert(schema.workflows)
      .values({ key: `tramo-${run}`, name: `Tramo ${run}`, sortOrder: 900 })
      .returning({ id: schema.workflows.id });
    otherTramoId = other.id;
    ids.workflows.push(other.id);
  });

  afterAll(async () => {
    if (first) await db.update(schema.workflows).set({ autoStart: first.autoStart }).where(eq(schema.workflows.id, first.id));
    if (ids.projects.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids.projects));
      await db.delete(schema.projectStages).where(inArray(schema.projectStages.projectId, ids.projects));
      await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    }
    if (ids.workflows.length) await db.delete(schema.workflows).where(inArray(schema.workflows.id, ids.workflows));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    startTramo.mockReset();
    startTramo.mockResolvedValue({ batchId: null, createdCount: 0, skippedCount: 0, stageCreated: true });
  });

  const create = async (name: string) => {
    const row = await repo.createProject({ name, clientId }, actorId);
    ids.projects.push(row.id);
    return row;
  };

  describe("createProject", () => {
    it("starts the first tramo with every active fase and no assignee when it auto-starts on create", async () => {
      if (!first || firstPhaseIds.length === 0) return;
      await db.update(schema.workflows).set({ autoStart: "on_create" }).where(eq(schema.workflows.id, first.id));

      const row = await create(`  Casa ${run} A  `);

      expect(row.name).toBe(`Casa ${run} A`);
      expect(row.clientId).toBe(clientId);
      expect(row).not.toHaveProperty("phase");
      expect(row).not.toHaveProperty("phases");
      expect(startTramo).toHaveBeenCalledTimes(1);
      expect(startTramo.mock.calls[0][1]).toEqual({
        projectId: row.id,
        workflowId: first.id,
        phaseIds: firstPhaseIds,
        assignment: { mode: "none" },
        actorId,
        trigger: "on_create",
      });
    });

    it("starts nothing when the first tramo doesn't auto-start on create", async () => {
      if (!first) return;
      await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));

      const row = await create(`Casa ${run} B`);

      expect(startTramo).not.toHaveBeenCalled();
      expect(row.currentWorkflowId).toBeNull();
      expect(row.needsTramo).toBe(true);
      expect(row.tramos).toEqual([]);
    });

    it("rolls the project back when the start fails", async () => {
      if (!first || firstPhaseIds.length === 0) return;
      await db.update(schema.workflows).set({ autoStart: "on_create" }).where(eq(schema.workflows.id, first.id));
      startTramo.mockRejectedValueOnce(new Error("boom"));

      await expect(repo.createProject({ name: `Casa ${run} C`, clientId }, actorId)).rejects.toThrow("boom");
      const rows = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.name, `Casa ${run} C`));
      expect(rows).toEqual([]);
    });

    it("rejects a taken name with NAME_TAKEN and a blank one with EMPTY", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      await create(`Casa ${run} D`);
      await expect(repo.createProject({ name: `casa ${run} d`, clientId }, actorId)).rejects.toThrow("NAME_TAKEN");
      await expect(repo.createProject({ name: "   ", clientId }, actorId)).rejects.toThrow("EMPTY");
    });
  });

  describe("setProjectCurrentTramo", () => {
    it("is NOT_STARTED for a tramo without a stage row, and NOT_FOUND for a missing project", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      const row = await create(`Casa ${run} E`);
      await expect(repo.setProjectCurrentTramo(row.id, otherTramoId, actorId)).rejects.toThrow("NOT_STARTED");
      await expect(repo.setProjectCurrentTramo(randomUUID(), otherTramoId, actorId)).rejects.toThrow("NOT_FOUND");
    });

    it("moves the current tramo to a started one and records the change", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      const row = await create(`Casa ${run} F`);
      await db.insert(schema.projectStages).values({ projectId: row.id, workflowId: otherTramoId });

      const updated = await repo.setProjectCurrentTramo(row.id, otherTramoId, actorId);

      expect(updated.currentWorkflowId).toBe(otherTramoId);
      expect(updated.tramos.find((t) => t.id === otherTramoId)?.current).toBe(true);
      const history = await db
        .select({ field: schema.historyEvents.field })
        .from(schema.historyEvents)
        .where(eq(schema.historyEvents.entityId, row.id));
      expect(history.map((h) => h.field)).toContain("currentWorkflowId");
    });
  });

  describe("assignProjectTramo", () => {
    it("opens the stage through startTramo with stageOnly on a project without a current tramo", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      const row = await create(`Casa ${run} G`);

      await repo.assignProjectTramo(row.id, otherTramoId, actorId);

      expect(startTramo).toHaveBeenCalledTimes(1);
      expect(startTramo.mock.calls[0][1]).toMatchObject({
        projectId: row.id,
        workflowId: otherTramoId,
        phaseIds: [],
        stageOnly: true,
        actorId,
      });
    });

    it("is NOT_STARTED once the project has a current tramo", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      const row = await create(`Casa ${run} H`);
      await db.insert(schema.projectStages).values({ projectId: row.id, workflowId: otherTramoId });
      await db.update(schema.projects).set({ currentWorkflowId: otherTramoId }).where(eq(schema.projects.id, row.id));

      await expect(repo.assignProjectTramo(row.id, otherTramoId, actorId)).rejects.toThrow("NOT_STARTED");
      expect(startTramo).not.toHaveBeenCalled();
    });
  });
});
