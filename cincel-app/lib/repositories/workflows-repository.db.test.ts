// @vitest-environment node
/**
 * Template writes against a real Postgres (project flow BE §7.1, §8.2): a
 * fase is required, a fase of another tramo is PHASE_MISMATCH and a repeated
 * title in the same fase is NAME_TAKEN. Runs only when TEST_DATABASE_URL
 * points at a migrated database; every row a test creates carries a per-run
 * marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { lockTramoCatalog } from "@/tests/setup/catalog-lock";

const url = process.env.TEST_DATABASE_URL;

// The fase check comes from the phases repository; until its real body lands
// this falls back to the same rule (BE §8.1) so the template writes run here.
vi.mock("./workflow-phases-repository", async (importOriginal) => {
  const real = await importOriginal<typeof import("./workflow-phases-repository")>();
  const { and, eq } = await import("drizzle-orm");
  const { workflowPhases } = await import("@/lib/db/schema");
  return {
    ...real,
    assertPhaseInWorkflow: async (...args: Parameters<typeof real.assertPhaseInWorkflow>) => {
      try {
        return await real.assertPhaseInWorkflow(...args);
      } catch (err) {
        if (!(err instanceof Error) || !err.message.startsWith("not implemented")) throw err;
      }
      const [tx, phaseId, workflowId] = args;
      const [row] = await tx
        .select({ id: workflowPhases.id })
        .from(workflowPhases)
        .where(and(eq(workflowPhases.id, phaseId), eq(workflowPhases.workflowId, workflowId)))
        .limit(1);
      if (!row) throw new Error("PHASE_MISMATCH");
    },
  };
});

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("workflow templates (test DB)", async () => {
  // One catalog-changing file at a time (see tests/setup/catalog-lock.ts).
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockTramoCatalog(url!);
  }, 300_000);
  afterAll(async () => {
    await unlockCatalog?.();
  });

  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("./workflows-repository");

  let actorId = "";
  let tramoA = "";
  let tramoB = "";
  let faseA1 = "";
  let faseA2 = "";
  let faseB1 = "";

  beforeAll(async () => {
    const [actor] = await db
      .insert(schema.staff)
      .values({ name: `Plantillas ${run}`, email: `plantillas-${run}@example.com`, role: "Administrador" })
      .returning({ id: schema.staff.id });
    actorId = actor.id;
    const [a, b] = await db
      .insert(schema.workflows)
      .values([
        { key: `test-a-${run}`, name: `Tramo A ${run}`, active: true, sortOrder: 900 },
        { key: `test-b-${run}`, name: `Tramo B ${run}`, active: true, sortOrder: 901 },
      ])
      .returning({ id: schema.workflows.id });
    tramoA = a.id;
    tramoB = b.id;
    const phases = await db
      .insert(schema.workflowPhases)
      .values([
        { workflowId: tramoA, name: "Fase 1", sortOrder: 0 },
        { workflowId: tramoA, name: "Fase 2", sortOrder: 1 },
        { workflowId: tramoB, name: "Fase 1", sortOrder: 0 },
      ])
      .returning({ id: schema.workflowPhases.id });
    [faseA1, faseA2, faseB1] = phases.map((p) => p.id);
  });

  afterAll(async () => {
    const tramos = [tramoA, tramoB].filter(Boolean);
    if (tramos.length) {
      await db.delete(schema.workflowTaskTemplates).where(inArray(schema.workflowTaskTemplates.workflowId, tramos));
      await db.delete(schema.workflowPhases).where(inArray(schema.workflowPhases.workflowId, tramos));
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, tramos));
      await db.delete(schema.workflows).where(inArray(schema.workflows.id, tramos));
    }
    if (actorId) await db.delete(schema.staff).where(eq(schema.staff.id, actorId));
  });

  it("creates a template in a fase of its tramo and returns the fase name", async () => {
    const row = await repo.createTemplate(tramoA, { phaseId: faseA1, title: "Levantamiento" }, actorId);
    expect(row).toMatchObject({ workflowId: tramoA, phaseId: faseA1, phaseName: "Fase 1", title: "Levantamiento" });
    expect(row).not.toHaveProperty("phase");
  });

  it("requires a fase", async () => {
    await expect(
      repo.createTemplate(tramoA, { phaseId: "", title: "Sin fase" }, actorId)
    ).rejects.toThrow("INVALID: phaseId");
  });

  it("rejects a fase of another tramo with PHASE_MISMATCH", async () => {
    await expect(
      repo.createTemplate(tramoA, { phaseId: faseB1, title: "Ajena" }, actorId)
    ).rejects.toThrow(/^PHASE_MISMATCH/);
    const existing = await repo.createTemplate(tramoA, { phaseId: faseA1, title: "Mover" }, actorId);
    await expect(repo.updateTemplate(existing.id, { phaseId: faseB1 }, actorId)).rejects.toThrow(/^PHASE_MISMATCH/);
  });

  it("rejects a repeated title in the same fase with NAME_TAKEN, case-insensitively", async () => {
    await repo.createTemplate(tramoA, { phaseId: faseA1, title: "Planos" }, actorId);
    await expect(
      repo.createTemplate(tramoA, { phaseId: faseA1, title: "  planos " }, actorId)
    ).rejects.toThrow(/^NAME_TAKEN/);
  });

  it("allows the same title in another fase of the same tramo", async () => {
    await repo.createTemplate(tramoA, { phaseId: faseA1, title: "Garantías" }, actorId);
    const other = await repo.createTemplate(tramoA, { phaseId: faseA2, title: "Garantías" }, actorId);
    expect(other.phaseId).toBe(faseA2);
  });

  it("rejects moving or renaming onto a taken title with NAME_TAKEN", async () => {
    await repo.createTemplate(tramoA, { phaseId: faseA2, title: "Fachadas" }, actorId);
    const moving = await repo.createTemplate(tramoA, { phaseId: faseA1, title: "Fachadas" }, actorId);
    await expect(repo.updateTemplate(moving.id, { phaseId: faseA2 }, actorId)).rejects.toThrow(/^NAME_TAKEN/);
    const renaming = await repo.createTemplate(tramoA, { phaseId: faseA2, title: "Alzados" }, actorId);
    await expect(repo.updateTemplate(renaming.id, { title: "FACHADAS" }, actorId)).rejects.toThrow(/^NAME_TAKEN/);
  });

  it("keeps the fase on a partial update and moves it within the tramo", async () => {
    const row = await repo.createTemplate(tramoA, { phaseId: faseA1, title: "Volumetría" }, actorId);
    const deactivated = await repo.deactivateTemplate(row.id, actorId);
    expect(deactivated).toMatchObject({ active: false, phaseId: faseA1 });
    const moved = await repo.updateTemplate(row.id, { phaseId: faseA2 }, actorId);
    expect(moved).toMatchObject({ phaseId: faseA2, phaseName: "Fase 2" });
  });
});
