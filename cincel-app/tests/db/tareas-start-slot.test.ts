// @vitest-environment node
/**
 * Tareas start slot (#958) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row it creates carries a per-run marker and is deleted afterwards.
 *
 * - `loadTareasStartSlot` runs ≤ 5 statements (`countQueries`).
 * - It equals today's reads: `fetchEtapaBoardAction` for the board and
 *   `fetchAssignableStaffAction` mapped to `{id,name,suggested}` for the
 *   candidates (same rows, same order).
 * - The started list keeps its batch and `canUndo` (`isBatchTouched`).
 * - A viewer without the Tareas capability gets FORBIDDEN; so does a guest.
 *   An unknown etapa is null.
 * - `previewStartEtapaAction` for a project the viewer can't see (no
 *   `canViewProjects`) is FORBIDDEN, and the preview only reads.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** Turns the Tareas (`canViewActivities`) or Proyectos (`canViewProjects`) capability off, as a role override would. */
const perms = vi.hoisted(() => ({ noActivities: false, noProjects: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveActivitiesCapabilities: (user: Parameters<typeof actual.resolveActivitiesCapabilities>[0]) => {
      const caps = actual.resolveActivitiesCapabilities(user);
      return perms.noActivities ? { ...caps, canViewActivities: false, canCreateActivity: false } : caps;
    },
    resolveProjectsCapabilities: (user: Parameters<typeof actual.resolveProjectsCapabilities>[0]) => {
      const caps = actual.resolveProjectsCapabilities(user);
      return perms.noProjects ? { ...caps, canViewProjects: false } : caps;
    },
  };
});

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("tareas start slot (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { countQueries } = await import("../helpers/count-queries");
  const { getTareasStartSlotData } = await import("@/lib/actions/page-data/tareas-actions");
  const { loadTareasStartSlot } = await import("@/lib/loaders/tareas");
  const { fetchEtapaBoardAction, previewStartEtapaAction } = await import("@/lib/actions/etapa-start-actions");
  const { fetchAssignableStaffAction } = await import("@/lib/actions/staff-actions");
  const { isBatchTouched } = await import("@/lib/project-flow/start-etapa");

  const ids = { projects: [] as string[], staff: [] as string[], positions: [] as string[] };
  let workflowId = "";
  let viewerId = "";
  let suggestedId = "";
  let readyProject = "";
  let startedProject = "";
  let batchId = "";

  const admin = () => ({ id: viewerId, access: "Administrador" as const });
  const colaborador = () => ({ id: viewerId, access: "Colaborador" as const });

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Slot ${run}`, lastName: "Viewer", email: `slot-${run}@cincel.example` },
        { name: `Slot ${run} sugerida`, lastName: "Puesto", email: `slot-sug-${run}@cincel.example` },
        { name: `Slot ${run} inactiva`, email: `slot-off-${run}@cincel.example`, active: false },
      ])
      .returning({ id: schema.staff.id });
    viewerId = members[0].id;
    suggestedId = members[1].id;
    ids.staff.push(...members.map((m) => m.id));

    // An etapa of its own (no readiness rule): every live active project not started in it is "ready".
    const [workflow] = await db
      .insert(schema.workflows)
      .values({ key: `slot-${run}`, name: `Slot ${run}`, sortOrder: 900 })
      .returning({ id: schema.workflows.id });
    workflowId = workflow.id;
    const [phase] = await db
      .insert(schema.workflowPhases)
      .values({ workflowId, name: `Fase ${run}`, sortOrder: 1 })
      .returning({ id: schema.workflowPhases.id });

    const [position] = await db
      .insert(schema.positions)
      .values({ name: `Puesto slot ${run}` })
      .returning({ id: schema.positions.id });
    ids.positions.push(position.id);
    await db.insert(schema.positionPhases).values({ positionId: position.id, phaseId: phase.id });
    await db.insert(schema.staffPositions).values({ staffId: suggestedId, positionId: position.id });

    const projects = await db
      .insert(schema.projects)
      .values([
        { name: `Slot ${run} listo`, status: "activo" },
        { name: `Slot ${run} iniciado`, status: "activo" },
      ])
      .returning({ id: schema.projects.id });
    [readyProject, startedProject] = projects.map((p) => p.id);
    ids.projects.push(...projects.map((p) => p.id));

    await db.insert(schema.projectStages).values({ projectId: startedProject, workflowId, startedById: viewerId });
    const [batch] = await db
      .insert(schema.etapaStartBatches)
      .values({ projectId: startedProject, workflowId, startedById: viewerId, assignmentMode: "none", createdCount: 2 })
      .returning({ id: schema.etapaStartBatches.id });
    batchId = batch.id;
  });

  afterAll(async () => {
    // Projects cascade to their stages and start batches.
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.positions.length) await db.delete(schema.positions).where(inArray(schema.positions.id, ids.positions));
    if (workflowId) {
      await db.delete(schema.workflowPhases).where(eq(schema.workflowPhases.workflowId, workflowId));
      await db.delete(schema.workflows).where(eq(schema.workflows.id, workflowId));
    }
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    perms.noActivities = false;
    perms.noProjects = false;
  });

  it("runs ≤ 5 statements", async () => {
    const user = await asViewer(admin(), () => requireCapabilityUser());
    const { result, count } = await countQueries(() => loadTareasStartSlot(user, { etapaId: workflowId }));
    expect(result).not.toBeNull();
    expect(count).toBeLessThanOrEqual(5);
  });

  it("equals today's fetchEtapaBoardAction + fetchAssignableStaffAction (mapped to {id,name,suggested})", async () => {
    const slot = await asViewer(admin(), () => getTareasStartSlotData({ etapaId: workflowId }));
    const board = await asViewer(admin(), () => fetchEtapaBoardAction(workflowId));
    const staff = await asViewer(admin(), () => fetchAssignableStaffAction(workflowId));

    expect(slot?.board).toEqual(board);
    expect(slot?.candidates).toEqual(
      staff.map((s) => ({ id: s.id, name: [s.name, s.lastName].filter(Boolean).join(" "), suggested: s.suggested })),
    );
    expect(slot?.canStart).toBe(true);

    expect(slot?.board.ready.map((r) => r.project.id)).toContain(readyProject);
    expect(slot?.board.ready.map((r) => r.project.id)).not.toContain(startedProject);
  });

  it("keeps the started project's latest batch and canUndo", async () => {
    const slot = await asViewer(admin(), () => getTareasStartSlotData({ etapaId: workflowId }));
    const started = slot?.board.started.find((s) => s.projectId === startedProject);
    expect(started).toEqual({ projectId: startedProject, batchId, createdCount: 2, canUndo: !(await isBatchTouched(db, batchId)) });
    expect(started?.canUndo).toBe(true);
  });

  it("sends candidates as {id,name,suggested} only: active staff, puesto suggestions first", async () => {
    const slot = await asViewer(admin(), () => getTareasStartSlotData({ etapaId: workflowId }));
    const candidates = slot?.candidates ?? [];
    for (const row of candidates) expect(Object.keys(row).sort()).toEqual(["id", "name", "suggested"]);
    expect(candidates.find((c) => c.id === suggestedId)).toEqual({
      id: suggestedId,
      name: `Slot ${run} sugerida Puesto`,
      suggested: true,
    });
    expect(candidates.find((c) => c.id === viewerId)?.suggested).toBe(false);
    expect(candidates.some((c) => c.id === ids.staff[2])).toBe(false);
    const firstUnsuggested = candidates.findIndex((c) => !c.suggested);
    expect(candidates.slice(firstUnsuggested).every((c) => !c.suggested)).toBe(true);
  });

  it("is null for an unknown etapa", async () => {
    expect(await asViewer(admin(), () => getTareasStartSlotData({ etapaId: randomUUID() }))).toBeNull();
  });

  it("a viewer without the Tareas capability gets FORBIDDEN", async () => {
    perms.noActivities = true;
    await expect(asViewer(colaborador(), () => getTareasStartSlotData({ etapaId: workflowId }))).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("a guest gets FORBIDDEN", async () => {
    await expect(asViewer(null, () => getTareasStartSlotData({ etapaId: workflowId }))).rejects.toThrow("FORBIDDEN");
  });

  it("rejects a malformed etapa id", async () => {
    await expect(asViewer(admin(), () => getTareasStartSlotData({ etapaId: "nope" }))).rejects.toThrow("INVALID");
  });

  it("previewStartEtapaAction for a project the viewer can't see is FORBIDDEN", async () => {
    perms.noProjects = true;
    await expect(asViewer(colaborador(), () => previewStartEtapaAction(readyProject, workflowId))).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("previewStartEtapaAction only reads", async () => {
    const { result, statements } = await countQueries(() =>
      asViewer(admin(), () => previewStartEtapaAction(readyProject, workflowId)),
    );
    expect(result.project.id).toBe(readyProject);
    expect(statements.length).toBeGreaterThan(0);
    for (const statement of statements) expect(statement.sql.trimStart().toLowerCase()).toMatch(/^(select|with)\b/);
  });
});
