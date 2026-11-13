// @vitest-environment node
/**
 * Project create and current etapa against a real Postgres (project flow BE
 * §8.5, §9.4). `startEtapa` is replaced by a spy: these tests check what the
 * repository asks of it (on create: the first etapa with every active fase,
 * unassigned; "Asignar etapa": `stageOnly`), not the start itself. Runs only
 * when TEST_DATABASE_URL points at a migrated database; every row a test
 * creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { lockEtapaCatalog } from "@/tests/setup/catalog-lock";

const startEtapa = vi.hoisted(() => vi.fn());
vi.mock("@/lib/project-flow/start-etapa", () => ({ startEtapa }));

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("projects repository (test DB)", async () => {
  // One catalog-changing file at a time (see tests/setup/catalog-lock.ts).
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockEtapaCatalog(url!);
  }, 300_000);
  afterAll(async () => {
    await unlockCatalog?.();
  });

  const { and, asc, eq, inArray, isNull } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("./projects-repository");

  const ids = { staff: [] as string[], contacts: [] as string[], projects: [] as string[], workflows: [] as string[] };
  let actorId = "";
  /** The first active etapa, with its auto-start restored afterwards. */
  let first: { id: string; autoStart: "on_create" | "on_ready" | "manual" } | null = null;
  let firstPhaseIds: string[] = [];
  let otherEtapaId = "";

  beforeAll(async () => {
    const [actor] = await db
      .insert(schema.staff)
      .values({ name: `Admin ${run}`, email: `admin-${run}@cincel.example` })
      .returning({ id: schema.staff.id });
    actorId = actor.id;
    ids.staff.push(actor.id);

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
      .values({ key: `etapa-${run}`, name: `Etapa ${run}`, sortOrder: 900 })
      .returning({ id: schema.workflows.id });
    otherEtapaId = other.id;
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
    startEtapa.mockReset();
    startEtapa.mockResolvedValue({ batchId: null, createdCount: 0, skippedCount: 0, stageCreated: true });
  });

  const create = async (name: string) => {
    const row = await repo.createProject({ name }, actorId);
    ids.projects.push(row.id);
    return row;
  };

  describe("createProject", () => {
    it("starts the first etapa with every active fase and no assignee when it auto-starts on create", async () => {
      if (!first || firstPhaseIds.length === 0) return;
      await db.update(schema.workflows).set({ autoStart: "on_create" }).where(eq(schema.workflows.id, first.id));

      const row = await create(`  Casa ${run} A  `);

      expect(row.name).toBe(`Casa ${run} A`);
      expect(row.clientId).toBeNull();
      expect(row).not.toHaveProperty("phase");
      expect(row).not.toHaveProperty("phases");
      expect(startEtapa).toHaveBeenCalledTimes(1);
      expect(startEtapa.mock.calls[0][1]).toEqual({
        projectId: row.id,
        workflowId: first.id,
        phaseIds: firstPhaseIds,
        assignment: { mode: "none" },
        actorId,
        trigger: "on_create",
      });
    });

    it("starts nothing when the first etapa doesn't auto-start on create", async () => {
      if (!first) return;
      await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));

      const row = await create(`Casa ${run} B`);

      expect(startEtapa).not.toHaveBeenCalled();
      expect(row.currentWorkflowId).toBeNull();
      expect(row.needsEtapa).toBe(true);
      expect(row.etapas).toEqual([]);
    });

    it("rolls the project back when the start fails", async () => {
      if (!first || firstPhaseIds.length === 0) return;
      await db.update(schema.workflows).set({ autoStart: "on_create" }).where(eq(schema.workflows.id, first.id));
      startEtapa.mockRejectedValueOnce(new Error("boom"));

      await expect(repo.createProject({ name: `Casa ${run} C` }, actorId)).rejects.toThrow("boom");
      const rows = await db
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.name, `Casa ${run} C`));
      expect(rows).toEqual([]);
    });

    it("rejects a taken name with NAME_TAKEN and a blank one with EMPTY", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      await create(`Casa ${run} D`);
      await expect(repo.createProject({ name: `casa ${run} d` }, actorId)).rejects.toThrow("NAME_TAKEN");
      await expect(repo.createProject({ name: "   " }, actorId)).rejects.toThrow("EMPTY");
    });
  });

  describe("setProjectCurrentEtapa", () => {
    it("is NOT_STARTED for an etapa without a stage row, and NOT_FOUND for a missing project", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      const row = await create(`Casa ${run} E`);
      await expect(repo.setProjectCurrentEtapa(row.id, otherEtapaId, actorId)).rejects.toThrow("NOT_STARTED");
      await expect(repo.setProjectCurrentEtapa(randomUUID(), otherEtapaId, actorId)).rejects.toThrow("NOT_FOUND");
    });

    it("moves the current etapa to a started one and records the change", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      const row = await create(`Casa ${run} F`);
      await db.insert(schema.projectStages).values({ projectId: row.id, workflowId: otherEtapaId });

      const updated = await repo.setProjectCurrentEtapa(row.id, otherEtapaId, actorId);

      expect(updated.currentWorkflowId).toBe(otherEtapaId);
      expect(updated.etapas.find((t) => t.id === otherEtapaId)?.current).toBe(true);
      const history = await db
        .select({ field: schema.historyEvents.field })
        .from(schema.historyEvents)
        .where(eq(schema.historyEvents.entityId, row.id));
      expect(history.map((h) => h.field)).toContain("currentWorkflowId");
    });
  });

  describe("assignProjectEtapa", () => {
    it("opens the stage through startEtapa with stageOnly on a project without a current etapa", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      const row = await create(`Casa ${run} G`);

      await repo.assignProjectEtapa(row.id, otherEtapaId, actorId);

      expect(startEtapa).toHaveBeenCalledTimes(1);
      expect(startEtapa.mock.calls[0][1]).toMatchObject({
        projectId: row.id,
        workflowId: otherEtapaId,
        phaseIds: [],
        stageOnly: true,
        actorId,
      });
    });

    it("is NOT_STARTED once the project has a current etapa", async () => {
      if (first) await db.update(schema.workflows).set({ autoStart: "manual" }).where(eq(schema.workflows.id, first.id));
      const row = await create(`Casa ${run} H`);
      await db.insert(schema.projectStages).values({ projectId: row.id, workflowId: otherEtapaId });
      await db.update(schema.projects).set({ currentWorkflowId: otherEtapaId }).where(eq(schema.projects.id, row.id));

      await expect(repo.assignProjectEtapa(row.id, otherEtapaId, actorId)).rejects.toThrow("NOT_STARTED");
      expect(startEtapa).not.toHaveBeenCalled();
    });
  });
});
