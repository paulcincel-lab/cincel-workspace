// @vitest-environment node
/**
 * Fases, espacios and puestos repositories against a real Postgres (BE §8.1,
 * §8.3, §8.4): a task's fase must belong to its etapa (`tasks_phase_fk`),
 * names are unique by nameKey, deleting an espacio frees its tasks, and
 * candidates come sorted by open tasks. Runs only when TEST_DATABASE_URL
 * points at a migrated database. Every row a test creates carries a per-run
 * marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lockEtapaCatalog } from "@/tests/setup/catalog-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("project flow repositories (test DB)", async () => {
  // One catalog-changing file at a time (see tests/setup/catalog-lock.ts).
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockEtapaCatalog(url!);
  }, 300_000);
  afterAll(async () => {
    await unlockCatalog?.();
  });

  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { eq, inArray } = await import("drizzle-orm");
  const phasesRepo = await import("./workflow-phases-repository");
  const spacesRepo = await import("./project-spaces-repository");
  const positionsRepo = await import("./positions-repository");

  const staffIds: string[] = [];
  const workflowIds: string[] = [];
  const positionIds: string[] = [];
  const taskIds: string[] = [];
  let projectId = "";
  let actorId = "";
  let workflowA = "";
  let workflowB = "";
  let phaseA = "";
  let phaseB = "";

  async function newStaff(name: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `${name} ${run}` })
      .returning({ id: schema.staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  async function newTask(values: Partial<typeof schema.tasks.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(schema.tasks)
      .values({ projectId, kind: "usuario", title: `Tarea ${run}`, createdById: actorId, ...values })
      .returning({ id: schema.tasks.id });
    taskIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    actorId = await newStaff("Actor");
    const created = await db
      .insert(schema.workflows)
      .values([
        { key: `a_${run}`, name: `Etapa A ${run}`, sortOrder: 900 },
        { key: `b_${run}`, name: `Etapa B ${run}`, sortOrder: 901 },
      ])
      .returning({ id: schema.workflows.id });
    workflowA = created[0].id;
    workflowB = created[1].id;
    workflowIds.push(workflowA, workflowB);
    phaseA = (await phasesRepo.createPhase(workflowA, { name: "Anteproyecto" }, actorId)).id;
    phaseB = (await phasesRepo.createPhase(workflowB, { name: "Obra negra" }, actorId)).id;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Proyecto fases ${run}` })
      .returning({ id: schema.projects.id });
    projectId = project.id;
  });

  afterAll(async () => {
    if (taskIds.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, taskIds));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds));
    }
    if (projectId) await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    if (positionIds.length) await db.delete(schema.positions).where(inArray(schema.positions.id, positionIds));
    if (workflowIds.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, workflowIds));
      await db.delete(schema.workflowPhases).where(inArray(schema.workflowPhases.workflowId, workflowIds));
      await db.delete(schema.workflows).where(inArray(schema.workflows.id, workflowIds));
    }
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  describe("fases", () => {
    it("rejects a task whose fase belongs to another etapa", async () => {
      await expect(newTask({ workflowId: workflowA, phaseId: phaseB })).rejects.toThrow();
      await expect(newTask({ workflowId: workflowA, phaseId: phaseA })).resolves.toBeTruthy();
    });

    it("rejects a fase without an etapa", async () => {
      await expect(newTask({ workflowId: null, phaseId: phaseA })).rejects.toThrow();
    });

    it("assertPhaseInWorkflow throws PHASE_MISMATCH for another etapa's fase", async () => {
      await expect(phasesRepo.assertPhaseInWorkflow(db, phaseA, workflowA)).resolves.toBeUndefined();
      await expect(phasesRepo.assertPhaseInWorkflow(db, phaseB, workflowA)).rejects.toThrow("PHASE_MISMATCH");
    });

    it("refuses names that only differ by case or accents", async () => {
      await expect(phasesRepo.createPhase(workflowA, { name: "anteproyécto" }, actorId)).rejects.toThrow(
        "NAME_TAKEN"
      );
      await expect(phasesRepo.createPhase(workflowA, { name: "   " }, actorId)).rejects.toThrow("EMPTY");
      // The same name in another etapa is fine ("Minutas" in Presale and Diseño).
      const other = await phasesRepo.createPhase(workflowB, { name: "Anteproyecto" }, actorId);
      expect(other.workflowId).toBe(workflowB);
    });

    it("appends, renames, deactivates and reorders", async () => {
      const second = await phasesRepo.createPhase(workflowA, { name: "Ejecutivo" }, actorId);
      expect(second.sortOrder).toBeGreaterThan(0);
      const renamed = await phasesRepo.updatePhase(second.id, { name: "Proyecto ejecutivo", active: false }, actorId);
      expect(renamed).toMatchObject({ name: "Proyecto ejecutivo", active: false });
      expect((await phasesRepo.listPhases(workflowA)).map((p) => p.id)).not.toContain(second.id);
      expect((await phasesRepo.listPhases(workflowA, { includeInactive: true })).map((p) => p.id)).toContain(
        second.id
      );

      await phasesRepo.reorderPhases(workflowA, [second.id, phaseA]);
      const ordered = await phasesRepo.listPhases(workflowA, { includeInactive: true });
      expect(ordered.map((p) => p.id)).toEqual([second.id, phaseA]);
      await expect(phasesRepo.reorderPhases(workflowA, [phaseA])).rejects.toThrow("NOT_FOUND");

      const history = await db
        .select({ field: schema.historyEvents.field })
        .from(schema.historyEvents)
        .where(eq(schema.historyEvents.entityId, workflowA));
      expect(history.map((h) => h.field)).toContain("phase:Ejecutivo");
    });

    it("resolves a gate fase by etapa key and fase key", async () => {
      await db.update(schema.workflowPhases).set({ key: "gate" }).where(eq(schema.workflowPhases.id, phaseA));
      expect(await phasesRepo.resolveGatePhase(db, `a_${run}`, "gate")).toMatchObject({ id: phaseA });
      expect(await phasesRepo.resolveGatePhase(db, `b_${run}`, "gate")).toBeNull();
    });
  });

  describe("espacios", () => {
    it("creates, dedupes by nameKey, and frees tasks on delete", async () => {
      const cocina = await spacesRepo.createSpace(projectId, "Cocina");
      await expect(spacesRepo.createSpace(projectId, " cocína ")).rejects.toThrow("NAME_TAKEN");
      const bano = await spacesRepo.createSpace(projectId, "Baño");
      expect(bano.sortOrder).toBeGreaterThan(cocina.sortOrder);

      const found = await db.transaction((tx) => spacesRepo.findOrCreateSpace(tx, projectId, "COCINA"));
      expect(found).toBe(cocina.id);

      const taskId = await newTask({ spaceId: cocina.id });
      expect((await spacesRepo.listSpaces(projectId)).find((s) => s.id === cocina.id)?.taskCount).toBe(1);

      await spacesRepo.reorderSpaces(projectId, [bano.id, cocina.id]);
      expect((await spacesRepo.listSpaces(projectId)).map((s) => s.id)).toEqual([bano.id, cocina.id]);

      await spacesRepo.deleteSpace(cocina.id, actorId);
      const [task] = await db
        .select({ spaceId: schema.tasks.spaceId })
        .from(schema.tasks)
        .where(eq(schema.tasks.id, taskId));
      expect(task.spaceId).toBeNull();
      const [event] = await db
        .select({ field: schema.historyEvents.field, before: schema.historyEvents.beforeValue })
        .from(schema.historyEvents)
        .where(eq(schema.historyEvents.entityId, taskId));
      expect(event).toEqual({ field: "spaceId", before: cocina.id });
      expect((await spacesRepo.listSpaces(projectId)).map((s) => s.id)).toEqual([bano.id]);
    });

    it("assertSpaceInProject throws SPACE_MISMATCH for another project's espacio", async () => {
      await expect(spacesRepo.assertSpaceInProject(db, randomUUID(), projectId)).rejects.toThrow("SPACE_MISMATCH");
    });
  });

  describe("puestos", () => {
    it("lists candidates per fase, sorted by open tasks then name", async () => {
      const arquitecto = await positionsRepo.createPosition({ name: `Arquitecto ${run}` });
      positionIds.push(arquitecto.id);
      await expect(positionsRepo.createPosition({ name: `arquitécto ${run}` })).rejects.toThrow("NAME_TAKEN");
      const withPhases = await positionsRepo.setPositionPhases(arquitecto.id, [phaseA]);
      expect(withPhases.phases.map((p) => p.id)).toEqual([phaseA]);

      const busy = await newStaff("Ana");
      const free = await newStaff("Beto");
      await newStaff("Sin puesto");
      await positionsRepo.setStaffPositions(busy, [arquitecto.id]);
      await positionsRepo.setStaffPositions(free, [arquitecto.id]);
      await newTask({ managerId: busy });
      await newTask({ managerId: busy, status: "completado", closedAt: new Date() });

      const candidates = await positionsRepo.listCandidates(db, [phaseA, phaseB]);
      expect(candidates.get(phaseB)).toEqual([]);
      expect(candidates.get(phaseA)).toEqual([
        { id: free, name: `Beto ${run}`, positions: [`Arquitecto ${run}`], openTasks: 0 },
        { id: busy, name: `Ana ${run}`, positions: [`Arquitecto ${run}`], openTasks: 1 },
      ]);

      await positionsRepo.updatePosition(arquitecto.id, { active: false });
      expect((await positionsRepo.listCandidates(db, [phaseA])).get(phaseA)).toEqual([]);

      expect((await positionsRepo.listPositions()).find((p) => p.id === arquitecto.id)?.staffCount).toBe(2);
      await positionsRepo.softDeletePosition(arquitecto.id);
      expect(await positionsRepo.positionExists(arquitecto.id)).toBe(false);
      const left = await db
        .select()
        .from(schema.staffPositions)
        .where(eq(schema.staffPositions.positionId, arquitecto.id));
      expect(left).toEqual([]);
    });

    it("setStaffPositions keeps workspace rows", async () => {
      const person = await newStaff("Carla");
      const google = await positionsRepo.createPosition({ name: `Google ${run}` });
      const manual = await positionsRepo.createPosition({ name: `Manual ${run}` });
      positionIds.push(google.id, manual.id);
      await db.insert(schema.staffPositions).values({ staffId: person, positionId: google.id, source: "workspace" });
      await positionsRepo.setStaffPositions(person, [manual.id, google.id]);
      await positionsRepo.setStaffPositions(person, []);
      const rows = await db
        .select({ positionId: schema.staffPositions.positionId, source: schema.staffPositions.source })
        .from(schema.staffPositions)
        .where(eq(schema.staffPositions.staffId, person));
      expect(rows).toEqual([{ positionId: google.id, source: "workspace" }]);
    });
  });
});
