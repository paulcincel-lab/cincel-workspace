// @vitest-environment node
/**
 * Etapas color, order and counts against a real Postgres (#1016): an explicit
 * `color_slot` wins over the derived slot, `reorderWorkflowsAction` writes
 * `sort_order` in order, and the Etapas page counts active projects per
 * current etapa and tasks per fase. Runs only when TEST_DATABASE_URL points
 * at a migrated database; every row a test creates carries a per-run marker
 * and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { lockEtapaCatalog } from "@/tests/setup/catalog-lock";
import { unwrapActions } from "@/tests/helpers/action-result";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ memberId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Admin",
      role: "Administrador",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "admin@cincel.example",
    access: "Administrador",
  })),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("etapas color, order and counts (test DB)", async () => {
  // One catalog-changing file at a time (see tests/setup/catalog-lock.ts).
  let unlockCatalog: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlockCatalog = await lockEtapaCatalog(url!);
  }, 300_000);

  const { eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("./workflows-repository");
  const actions = await import("@/lib/actions/workflows-actions");
  const { reorderWorkflowsAction, updateWorkflowAction } = unwrapActions(actions);
  const { etapaColorSlot } = await import("@/lib/etapas/etapa-color");

  let adminId = "";
  const workflowIds: string[] = [];
  const phaseIds: string[] = [];
  const projectIds: string[] = [];

  beforeAll(async () => {
    const [admin] = await db
      .insert(schema.staff)
      .values({ name: `Etapas ${run}`, role: "Administrador" })
      .returning({ id: schema.staff.id });
    adminId = admin!.id;
    session.memberId = adminId;
    const rows = await db
      .insert(schema.workflows)
      .values([
        { key: `t1-${run}`, name: `Etapa 1 ${run}`, sortOrder: 2 },
        { key: `t2-${run}`, name: `Etapa 2 ${run}`, sortOrder: 950 },
        { key: `t3-${run}`, name: `Etapa 3 ${run}`, sortOrder: 951 },
      ])
      .returning({ id: schema.workflows.id });
    workflowIds.push(...rows.map((r) => r.id));
    const phases = await db
      .insert(schema.workflowPhases)
      .values([
        { workflowId: workflowIds[0]!, name: `Fase A ${run}`, sortOrder: 0 },
        { workflowId: workflowIds[0]!, name: `Fase B ${run}`, sortOrder: 1 },
      ])
      .returning({ id: schema.workflowPhases.id });
    phaseIds.push(...phases.map((p) => p.id));
  });

  afterAll(async () => {
    try {
      if (projectIds.length) {
        const rows = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
        const taskIds = rows.map((r) => r.id);
        if (taskIds.length) {
          await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, taskIds));
          await db.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds));
        }
        await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, projectIds));
        await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
      }
      if (workflowIds.length) {
        await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, workflowIds));
        await db.delete(schema.workflowPhases).where(inArray(schema.workflowPhases.workflowId, workflowIds));
        await db.delete(schema.workflows).where(inArray(schema.workflows.id, workflowIds));
      }
      if (adminId) await db.delete(schema.staff).where(eq(schema.staff.id, adminId));
    } finally {
      await unlockCatalog?.();
    }
  });

  it("color_slot overrides the derived slot", async () => {
    const id = workflowIds[0]!;
    const before = (await repo.listWorkflows({ includeInactive: true })).find((w) => w.id === id)!;
    expect(before.colorSlot).toBeNull();
    // Derived: sortOrder 2 → slot 2.
    expect(etapaColorSlot(before)).toBe(2);

    const saved = await updateWorkflowAction(id, { colorSlot: 5 });
    expect(saved.colorSlot).toBe(5);
    expect(etapaColorSlot(saved)).toBe(5);
    const nav = (await repo.listEtapasNav()).find((w) => w.id === id);
    expect(nav?.colorSlot).toBe(5);

    await expect(updateWorkflowAction(id, { colorSlot: 6 as never })).rejects.toThrow(/INVALID/);
    await expect(
      db.execute(sql`update core.workflows set color_slot = 0 where id = ${id}`),
    ).rejects.toThrow();

    const cleared = await updateWorkflowAction(id, { colorSlot: null });
    expect(cleared.colorSlot).toBeNull();
    expect(etapaColorSlot(cleared)).toBe(2);
  });

  it("reorder workflows", async () => {
    const [a, b, c] = workflowIds;
    await reorderWorkflowsAction([c!, a!, b!]);
    const rows = await db
      .select({ id: schema.workflows.id, sortOrder: schema.workflows.sortOrder })
      .from(schema.workflows)
      .where(inArray(schema.workflows.id, workflowIds));
    expect(Object.fromEntries(rows.map((r) => [r.id, r.sortOrder]))).toEqual({ [c!]: 0, [a!]: 1, [b!]: 2 });
    // Put them back at the end so other files see the firm's etapas first.
    await db.update(schema.workflows).set({ sortOrder: sql`${schema.workflows.sortOrder} + 950` }).where(inArray(schema.workflows.id, workflowIds));
  });

  it("active projects per etapa", async () => {
    const [a, b] = workflowIds;
    const projects = await db
      .insert(schema.projects)
      .values([
        { name: `Etapas ${run} 1`, currentWorkflowId: a },
        { name: `Etapas ${run} 2`, currentWorkflowId: a },
        { name: `Etapas ${run} 3`, currentWorkflowId: a, status: "pausado" },
        { name: `Etapas ${run} 4`, currentWorkflowId: a, deletedAt: new Date() },
        { name: `Etapas ${run} 5`, currentWorkflowId: b },
      ])
      .returning({ id: schema.projects.id });
    projectIds.push(...projects.map((p) => p.id));

    const counts = await repo.countActiveProjectsByWorkflow();
    expect(counts[a!]).toBe(2);
    expect(counts[b!]).toBe(1);
    expect(counts[workflowIds[2]!]).toBeUndefined();
  });

  it("tasks per fase", async () => {
    const [a] = workflowIds;
    const [faseA, faseB] = phaseIds;
    const [projectId] = projectIds;
    const [template] = await db
      .insert(schema.workflowTaskTemplates)
      .values({ workflowId: a!, phaseId: faseA!, title: `Plantilla ${run}` })
      .returning({ id: schema.workflowTaskTemplates.id });
    await db.insert(schema.tasks).values([
      { projectId: projectId!, kind: "usuario", title: `T1 ${run}`, createdById: adminId, workflowId: a, phaseId: faseA },
      { projectId: projectId!, kind: "usuario", title: `T2 ${run}`, createdById: adminId, workflowId: a, phaseId: faseA },
      { projectId: projectId!, kind: "usuario", title: `T3 ${run}`, createdById: adminId, workflowId: a, phaseId: faseA, deletedAt: new Date() },
      { projectId: projectId!, kind: "workflow", title: `T4 ${run}`, createdById: adminId, workflowId: a, phaseId: faseB, templateId: template!.id },
    ]);
    const counts = await repo.countTasksByPhase();
    expect(counts[faseA!]).toBe(2);
    expect(counts[faseB!]).toBe(1);
    await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, [projectId!]));
    await db.delete(schema.workflowTaskTemplates).where(eq(schema.workflowTaskTemplates.id, template!.id));
  });
});
