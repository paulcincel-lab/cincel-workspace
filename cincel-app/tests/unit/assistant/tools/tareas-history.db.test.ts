// @vitest-environment node
/**
 * Tareas tools against a real Postgres (redesign BE §9.9, §16): a write on a
 * shared task appends one `comentario` "<resumen> (vía asistente)" by the user,
 * and a failed write appends nothing. The task actions are mocked (they need a
 * session); the bitácora goes through the real history repository. Runs only
 * when TEST_DATABASE_URL points at a migrated database; every row a test
 * creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  fetchTaskAction: vi.fn(),
  createSubtaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
}));

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchTaskAction: actions.fetchTaskAction,
  setTaskStatusAction: vi.fn(),
  setTaskCustomStatusAction: vi.fn(),
  updateTaskAction: actions.updateTaskAction,
  addTaskCommentAction: vi.fn(),
  createSubtaskAction: actions.createSubtaskAction,
  createUserTaskAction: vi.fn(),
  assignTaskAction: vi.fn(),
}));
vi.mock("@/lib/actions/projects-actions", () => ({ fetchProjectAction: vi.fn() }));
vi.mock("@/lib/assistant/reads", () => ({ listViewerTasks: vi.fn(), listViewerMyTasks: vi.fn() }));
vi.mock("@/lib/actions/schedule-actions", () => ({ fetchScheduleAction: vi.fn() }));
vi.mock("@/lib/actions/search-actions", () => ({ searchWorkspaceAction: vi.fn() }));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchAssignableStaffAction: vi.fn() }));
vi.mock("@/lib/actions/task-statuses-actions", () => ({ fetchTaskStatusesAction: vi.fn() }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: vi.fn() }));
vi.mock("@/lib/actions/gmail-actions", () => ({ fetchGmailThreadAction: vi.fn() }));
vi.mock("@/lib/assistant/resolvers", () => ({ resolveProject: vi.fn(), resolveStaff: vi.fn() }));
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn().mockResolvedValue({ created: 0 }), NOTIFICATION_DEFAULTS: {} }));

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("tareas tools bitácora (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { tools } = await import("@/lib/assistant/tools/tareas");
  const { recordViaAsistente } = await import("@/lib/assistant/via-asistente");

  let staffId = "";
  let projectId = "";
  let taskId = "";

  function tool(name: string) {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(`missing tool ${name}`);
    return found.definition;
  }

  function admin() {
    return {
      member: { id: staffId, name: `Ana ${run}`, role: "Administrador", active: true },
      email: `ana-${run}@example.test`,
      access: "Administrador",
    } as never;
  }

  function taskDetail(overrides: Record<string, unknown> = {}) {
    return {
      id: taskId,
      projectId,
      title: `Revisar planos ${run}`,
      managerId: staffId,
      manager: { id: staffId, name: `Ana ${run}` },
      support: [],
      commitmentDate: null,
      status: "pendiente",
      customStatus: null,
      ...overrides,
    };
  }

  async function comments() {
    return db
      .select()
      .from(schema.historyEvents)
      .where(and(eq(schema.historyEvents.entityId, taskId), eq(schema.historyEvents.kind, "comentario")));
  }

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Ana ${run}`, email: `ana-${run}@example.test` })
      .returning({ id: schema.staff.id });
    staffId = member.id;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Proyecto asistente ${run}` })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    const [row] = await db
      .insert(schema.tasks)
      .values({ projectId, kind: "usuario", title: `Revisar planos ${run}`, createdById: staffId })
      .returning({ id: schema.tasks.id });
    taskId = row.id;
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await db.delete(schema.historyEvents).where(eq(schema.historyEvents.entityId, taskId));
    actions.fetchTaskAction.mockResolvedValue(taskDetail());
  });

  afterAll(async () => {
    const ids = [taskId, projectId].filter(Boolean);
    if (ids.length) await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids));
    if (taskId) await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    if (projectId) await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    if (staffId) await db.delete(schema.staff).where(eq(schema.staff.id, staffId));
  });

  it("recordViaAsistente stores one comentario by the user with the suffix", async () => {
    await recordViaAsistente({ entity: "task", entityId: taskId, actorId: staffId, summary: "Prueba" });
    const rows = await comments();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ entity: "task", actorId: staffId, comment: "Prueba (vía asistente)" });
  });

  it("add_subtask writes the bitácora row of the shared task", async () => {
    actions.createSubtaskAction.mockResolvedValue({ id: "c1", title: "Cortes", status: "pendiente" });
    const definition = tool("add_subtask");
    await definition.run(
      { user: admin(), context: { route: "/tareas" }, threadId: randomUUID() },
      definition.schema.parse({ taskId, title: "Cortes" }),
    );
    const rows = await comments();
    expect(rows.map((r) => r.comment)).toEqual([`Subtarea de «Revisar planos ${run}»: + «Cortes» (vía asistente)`]);
  });

  it("reschedule_task writes nothing when the action refuses", async () => {
    actions.updateTaskAction.mockRejectedValue(new Error("FORBIDDEN: task edit"));
    const definition = tool("reschedule_task");
    const result = await definition.run(
      { user: admin(), context: { route: "/tareas" }, threadId: randomUUID() },
      definition.schema.parse({ taskId, dueDate: "2026-12-01" }),
    );
    expect(result).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(await comments()).toHaveLength(0);
  });
});
