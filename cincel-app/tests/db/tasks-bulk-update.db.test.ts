// @vitest-environment node
/**
 * `bulkUpdateTasksAction` (#1040) against a real Postgres. Runs only when
 * TEST_DATABASE_URL points at a migrated database. Every row it creates
 * carries a per-run marker and is deleted afterwards.
 *
 * - One field on many tasks; each task keeps its own permission: the ones
 *   the viewer can't change are skipped with the error code, the rest change.
 * - Admin tasks are skipped for non-admins (and keep their own rules for
 *   admins); a deleted task is TASK_NOT_FOUND.
 * - Vence writes the date it shows (commitment when set, else delivery).
 * - Fase skips admin tasks and subtasks, like the Fase cell.
 * - Without the field's capability every task is skipped.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/tasks/closing-hook", () => ({ scheduleTaskClosingHook: vi.fn(async () => undefined) }));
vi.mock("@/lib/tasks/task-notifications", () => ({
  notifyTaskAssigned: vi.fn(async () => undefined),
  notifyTaskCommented: vi.fn(async () => undefined),
  notifyTraceId: vi.fn(async () => "trace"),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("bulkUpdateTasksAction (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { bulkUpdateTasksAction } = await import("@/lib/actions/tasks-actions");
  const { scheduleTaskClosingHook } = await import("@/lib/tasks/closing-hook");

  const ids = { projects: [] as string[], staff: [] as string[] };
  let meId = "";
  let otherId = "";
  let projectId = "";
  const t: Record<"a" | "b" | "admin" | "sub" | "gone" | "dated", string> = {
    a: "",
    b: "",
    admin: "",
    sub: "",
    gone: "",
    dated: "",
  };

  const admin = () => ({ id: meId, access: "Administrador" as const });
  const colaborador = () => ({ id: meId, access: "Colaborador" as const });

  async function read(id: string) {
    const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return row;
  }

  beforeAll(async () => {
    const [me, other] = await db
      .insert(schema.staff)
      .values([
        { name: `Masivo ${run}`, email: `masivo-${run}@cincel.example` },
        { name: `Otro ${run}`, email: `otro-${run}@cincel.example` },
      ])
      .returning({ id: schema.staff.id });
    meId = me.id;
    otherId = other.id;
    ids.staff.push(me.id, other.id);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Bulk ${run}`, status: "activo" as const })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    ids.projects.push(project.id);

    const task = (title: string, extra: Record<string, unknown> = {}) => ({
      projectId,
      kind: "usuario" as const,
      title: `BLK${run} ${title}`,
      createdById: meId,
      managerId: meId,
      ...extra,
    });
    const rows = await db
      .insert(schema.tasks)
      .values([
        task("A"),
        task("B", { status: "en_proceso" as const }),
        task("Admin", { kind: "admin" as const }),
        task("Borrada", { deletedAt: new Date() }),
        task("Con compromiso", { commitmentDate: "2026-12-01", deliveryDate: "2026-12-20" }),
      ])
      .returning({ id: schema.tasks.id });
    [t.a, t.b, t.admin, t.gone, t.dated] = rows.map((r) => r.id);
    const [sub] = await db
      .insert(schema.tasks)
      .values(task("Sub", { parentTaskId: t.a }))
      .returning({ id: schema.tasks.id });
    t.sub = sub.id;
  });

  afterAll(async () => {
    // Tasks go with their project (cascade).
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("changes the status of every task it can and skips the rest with their code", async () => {
    const result = await asViewer(colaborador(), () =>
      bulkUpdateTasksAction([t.a, t.b, t.admin, t.gone, t.a], { status: "completado" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.updated.sort()).toEqual([t.a, t.b].sort());
    expect(result.data.skipped).toEqual(
      expect.arrayContaining([
        { id: t.admin, reason: "FORBIDDEN" },
        { id: t.gone, reason: "TASK_NOT_FOUND" },
      ]),
    );
    expect(result.data.skipped).toHaveLength(2);
    expect((await read(t.a)).status).toBe("completado");
    expect((await read(t.b)).status).toBe("completado");
    expect((await read(t.admin)).status).toBe("pendiente");
    // One closing-hook pass for the changed tasks.
    expect(scheduleTaskClosingHook).toHaveBeenCalledTimes(1);
  });

  it("skips every task when the viewer lacks the field's capability", async () => {
    const result = await asViewer(colaborador(), () => bulkUpdateTasksAction([t.a, t.b], { managerId: otherId }));
    expect(result).toEqual({
      ok: true,
      data: {
        updated: [],
        skipped: [
          { id: t.a, reason: "FORBIDDEN" },
          { id: t.b, reason: "FORBIDDEN" },
        ],
      },
    });
    expect((await read(t.a)).managerId).toBe(meId);
  });

  it("reassigns as an administrator; an admin task keeps its rule (admin assignees only)", async () => {
    const result = await asViewer(admin(), () => bulkUpdateTasksAction([t.a, t.admin], { managerId: otherId }));
    expect(result).toEqual({
      ok: true,
      data: { updated: [t.a], skipped: [{ id: t.admin, reason: "ASSIGNEE_NOT_ADMIN" }] },
    });
    expect((await read(t.a)).managerId).toBe(otherId);
    expect((await read(t.admin)).managerId).toBe(meId);
  });

  it("Vence writes the commitment date when the task has one, else the delivery date", async () => {
    const result = await asViewer(colaborador(), () => bulkUpdateTasksAction([t.b, t.dated], { dueDate: "2027-01-15" }));
    expect(result).toEqual({ ok: true, data: { updated: [t.b, t.dated], skipped: [] } });
    const b = await read(t.b);
    expect(b.deliveryDate).toBe("2027-01-15");
    expect(b.commitmentDate).toBeNull();
    const dated = await read(t.dated);
    expect(dated.commitmentDate).toBe("2027-01-15");
    expect(dated.deliveryDate).toBe("2026-12-20");
  });

  it("Deshacer after clearing Vence restores the commitment date, not the delivery date", async () => {
    const before = await read(t.dated);
    expect(before.commitmentDate).not.toBeNull();
    await asViewer(colaborador(), () => bulkUpdateTasksAction([t.dated], { dueDate: null }));
    expect((await read(t.dated)).commitmentDate).toBeNull();
    await asViewer(colaborador(), () =>
      bulkUpdateTasksAction([t.dated], { dueDate: before.commitmentDate, dueField: "commitmentDate" }),
    );
    const after = await read(t.dated);
    expect(after.commitmentDate).toBe(before.commitmentDate);
    expect(after.deliveryDate).toBe(before.deliveryDate);
  });

  it("Fase skips subtasks and admin tasks", async () => {
    const result = await asViewer(admin(), () => bulkUpdateTasksAction([t.b, t.sub, t.admin], { phaseId: null }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.updated).toEqual([t.b]);
    expect(result.data.skipped).toEqual([
      { id: t.sub, reason: "SUBTASK_PHASE" },
      { id: t.admin, reason: "ADMIN_TASK" },
    ]);
  });

  it("replaces the equipo de apoyo", async () => {
    const result = await asViewer(admin(), () => bulkUpdateTasksAction([t.a, t.b], { supportIds: [otherId] }));
    expect(result).toEqual({ ok: true, data: { updated: [t.a, t.b], skipped: [] } });
    const support = await db
      .select({ taskId: schema.taskSupport.taskId, staffId: schema.taskSupport.staffId })
      .from(schema.taskSupport)
      .where(inArray(schema.taskSupport.taskId, [t.a, t.b]));
    expect(support.map((s) => s.staffId)).toEqual([otherId, otherId]);
  });
});
