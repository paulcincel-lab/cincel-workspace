// @vitest-environment node
/**
 * The Tramo cell of the Tareas tables (`components/tareas`) against a real Postgres (#1025): an
 * admin's `updateTaskAction({ workflowId })` moves the task to the other
 * tramo with its fase cleared, and the page reads (`getTareasListPage` per
 * Analítico tramo group) show it there and no longer in the old group; a
 * colaborador gets FORBIDDEN and nothing moves. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row it creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
// The closing hooks run after the response; not part of this test.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Tareas tramo cell: move and fase reset through the page (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { updateTaskAction } = await import("@/lib/actions/tasks-actions");
  const { getTareasListPage } = await import("@/lib/actions/page-data/tareas-actions");
  const { tareasListFiltersOf } = await import("@/lib/query/options/tareas");
  const { DEFAULT_TAREAS_QUERY } = await import("@/lib/tareas/query");
  const { tareasGroupFilters } = await import("@/lib/tareas/summary");

  const base = tareasListFiltersOf(DEFAULT_TAREAS_QUERY);
  let adminId = "";
  let workerId = "";
  let projectId = "";
  let taskId = "";
  const tramos = { diseno: { id: "", key: `diseno-${run}` }, obra: { id: "", key: `obra-${run}` } };
  const workflowIds: string[] = [];

  const admin = () => ({ id: adminId, access: "Administrador" as const });
  const worker = () => ({ id: workerId, access: "Colaborador" as const });

  /** The ids in one Analítico tramo group, as the page reads it. */
  async function group(tramoKey: string): Promise<Array<{ id: string; workflowId: string | null; phaseId: string | null }>> {
    const page = await asViewer(admin(), () =>
      getTareasListPage({ filters: tareasGroupFilters(base, projectId, tramoKey), cursor: null, orderBy: "retraso" }),
    );
    return page.rows.map((r) => ({ id: r.id, workflowId: r.workflowId, phaseId: r.phaseId }));
  }

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Admin tramo ${run}`, email: `admin-tramo-${run}@cincel.example`, role: "Administrador" },
        { name: `Colaborador tramo ${run}`, email: `colab-tramo-${run}@cincel.example`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    [adminId, workerId] = members.map((m) => m.id) as [string, string];
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Celdas tramo ${run}`, status: "activo", managerId: workerId })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
    const flows = await db
      .insert(schema.workflows)
      .values([
        { key: tramos.diseno.key, name: `Diseño ${run}` },
        { key: tramos.obra.key, name: `Obra ${run}` },
      ])
      .returning({ id: schema.workflows.id });
    [tramos.diseno.id, tramos.obra.id] = flows.map((f) => f!.id) as [string, string];
    workflowIds.push(tramos.diseno.id, tramos.obra.id);
    const [fase] = await db
      .insert(schema.workflowPhases)
      .values({ workflowId: tramos.diseno.id, name: `Anteproyecto ${run}` })
      .returning({ id: schema.workflowPhases.id });
    const [task] = await db
      .insert(schema.tasks)
      .values({
        projectId,
        kind: "usuario",
        title: `Planos ${run}`,
        createdById: adminId,
        managerId: workerId,
        workflowId: tramos.diseno.id,
        phaseId: fase!.id,
      })
      .returning({ id: schema.tasks.id });
    taskId = task!.id;
  });

  afterAll(async () => {
    const all = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.projectId, projectId));
    const ids = all.map((r) => r.id);
    if (ids.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids));
    }
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.workflowPhases).where(inArray(schema.workflowPhases.workflowId, workflowIds));
    await db.delete(schema.workflows).where(inArray(schema.workflows.id, workflowIds));
    await db.delete(schema.staff).where(inArray(schema.staff.id, [adminId, workerId]));
  });

  it("refuses the move for a colaborador and leaves the task in its group", async () => {
    const result = await asViewer(worker(), () => updateTaskAction(taskId, { workflowId: tramos.obra.id }));
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatch(/^FORBIDDEN/);
    expect((await group(tramos.diseno.key)).map((r) => r.id)).toEqual([taskId]);
    expect(await group(tramos.obra.key)).toEqual([]);
  });

  it("moves the task for an admin: the fase is cleared and the row is read in the new tramo group", async () => {
    const result = await asViewer(admin(), () => updateTaskAction(taskId, { workflowId: tramos.obra.id }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `phaseId: null` is what opens the Fase editor next in the table.
    expect(result.data).toMatchObject({ workflowId: tramos.obra.id, phaseId: null });
    expect(await group(tramos.diseno.key)).toEqual([]);
    expect(await group(tramos.obra.key)).toEqual([{ id: taskId, workflowId: tramos.obra.id, phaseId: null }]);
  });
});
