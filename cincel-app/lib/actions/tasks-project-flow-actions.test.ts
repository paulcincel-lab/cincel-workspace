import { unwrapActions } from "@/tests/helpers/action-result";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TASK_TRAMO_CHANGE_FORBIDDEN } from "@/lib/project-flow/errors";
import type { UserTaskInput } from "@/lib/types/core";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";
const OTHER_PROJECT = "44444444-4444-4444-8444-555555555555";
const TASK = "55555555-5555-4555-8555-555555555555";
const ADMIN_TASK = "55555555-5555-4555-8555-666666666666";
const WORKFLOW = "11111111-1111-4111-8111-111111111111";
const PHASE = "22222222-2222-4222-8222-111111111111";
const OTHER_PHASE = "22222222-2222-4222-8222-222222222222";
const SPACE = "77777777-7777-4777-8777-111111111111";
const OTHER_SPACE = "77777777-7777-4777-8777-222222222222";
const COLLABORATOR = "88888888-8888-4888-8888-111111111111";
const STATUS = "99999999-9999-4999-8999-111111111111";
const OTHER_WORKFLOW = "11111111-1111-4111-8111-222222222222";
const UNKNOWN_WORKFLOW = "11111111-1111-4111-8111-333333333333";

const session = vi.hoisted(() => ({ access: "Colaborador" }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "33333333-3333-4333-8333-333333333333" },
    access: session.access,
  })),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({
    canViewActivities: true,
    canCreateActivity: true,
    canChangeResponsible: true,
    canDeleteActivity: true,
    canReorderPhases: true,
    canExportData: true,
    statusScope: "all",
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

vi.mock("@/lib/db/client", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));

const hooks = vi.hoisted(() => ({
  onTaskClosingChanged: vi.fn(async () => {}),
  autoStartOnReady: vi.fn(async () => []),
}));
vi.mock("@/lib/project-flow/auto-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/project-flow/auto-start")>()),
  ...hooks,
}));

vi.mock("@/lib/project-flow/admin-tasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/project-flow/admin-tasks")>()),
  assertAdminAssignees: vi.fn(async (_tx: unknown, ids: Array<string | null | undefined>) => {
    if (ids.includes("88888888-8888-4888-8888-111111111111")) throw new Error("ASSIGNEE_NOT_ADMIN");
  }),
}));

vi.mock("@/lib/repositories/workflow-phases-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/workflow-phases-repository")>()),
  assertPhaseInWorkflow: vi.fn(async (_tx: unknown, phaseId: string) => {
    if (phaseId === "22222222-2222-4222-8222-222222222222") throw new Error("PHASE_MISMATCH");
  }),
}));

vi.mock("@/lib/repositories/project-spaces-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/project-spaces-repository")>()),
  assertSpaceInProject: vi.fn(async (_tx: unknown, spaceId: string) => {
    if (spaceId === "77777777-7777-4777-8777-222222222222") throw new Error("SPACE_MISMATCH");
  }),
}));

const repo = vi.hoisted(() => ({
  listTasks: vi.fn(),
  listMyTasks: vi.fn(),
  listCalendar: vi.fn(),
  getTask: vi.fn(),
  createUserTask: vi.fn(),
  createSubtask: vi.fn(),
  updateTask: vi.fn(),
  taskWorkflowId: vi.fn(),
  setTaskStatus: vi.fn(),
  setTaskCustomStatus: vi.fn(),
  assignTask: vi.fn(),
  setTaskSupport: vi.fn(),
  listAdminTasks: vi.fn(),
  createAdminTask: vi.fn(),
  assertTaskVisible: vi.fn(),
}));
vi.mock("@/lib/repositories/tasks-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/tasks-repository")>()),
  ...repo,
}));

import * as tasksActionsModule from "./tasks-actions";
const {
  assignTaskAction,
  createAdminTaskAction,
  createSubtaskAction,
  createUserTaskAction,
  fetchAdminTasksAction,
  fetchCalendarAction,
  fetchMyTasksAction,
  fetchTasksAction,
  setTaskCustomStatusAction,
  setTaskStatusAction,
  setTaskSupportAction,
  updateTaskAction,
} = unwrapActions(tasksActionsModule);

type Row = {
  id: string;
  projectId: string;
  kind: "usuario" | "admin";
  workflowId: string | null;
  phaseId: string | null;
  spaceId: string | null;
};

const userTask: Row = {
  id: TASK,
  projectId: PROJECT,
  kind: "usuario",
  workflowId: WORKFLOW,
  phaseId: PHASE,
  spaceId: null,
};
const adminTask: Row = {
  id: ADMIN_TASK,
  projectId: PROJECT,
  kind: "admin",
  workflowId: null,
  phaseId: null,
  spaceId: null,
};

function detail(row: Row) {
  return {
    ...row,
    workflow: row.workflowId ? { id: row.workflowId, key: "presale", name: "Presale" } : null,
    project: { id: row.projectId, name: "Casa Valle", clientName: null },
  };
}

function rowFor(id: string): Row {
  return id === ADMIN_TASK ? adminTask : userTask;
}

/** Task rules of BE §7.5, enforced wherever the implementation checks them (action or repository). */
function checkTaskInput(
  row: Row | null,
  input: {
    projectId?: string;
    workflowId?: string | null;
    phaseId?: string | null;
    spaceId?: string | null;
    managerId?: string | null;
  },
  opts: { canMoveTramo?: boolean } = {}
) {
  if (row?.kind === "admin") {
    if (input.phaseId !== undefined || input.spaceId !== undefined || input.workflowId) throw new Error("ADMIN_TASK");
    if (input.managerId === COLLABORATOR) throw new Error("ASSIGNEE_NOT_ADMIN");
    return;
  }
  if (row === null && !input.workflowId) throw new Error("INVALID: workflowId");
  if (row !== null && input.workflowId !== undefined && input.workflowId !== row.workflowId) {
    if (!input.workflowId || input.workflowId === UNKNOWN_WORKFLOW) throw new Error("INVALID: workflowId");
    if (row.workflowId !== null && !opts.canMoveTramo) throw new Error(TASK_TRAMO_CHANGE_FORBIDDEN);
  }
  if (input.phaseId === OTHER_PHASE) throw new Error("PHASE_MISMATCH");
  if (input.spaceId === OTHER_SPACE) throw new Error("SPACE_MISMATCH");
}

async function runAfter() {
  for (const cb of afterCallbacks.splice(0)) await cb();
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  session.access = "Colaborador";

  const list = [detail(userTask)];
  repo.listTasks.mockResolvedValue(list);
  repo.listMyTasks.mockResolvedValue(list);
  repo.listCalendar.mockResolvedValue(list);
  repo.getTask.mockImplementation(async (id: string) => detail(rowFor(id)));
  repo.assertTaskVisible.mockImplementation(async (id: string, viewer: { isAdmin: boolean }) => {
    if (id === ADMIN_TASK && !viewer?.isAdmin) throw new Error("FORBIDDEN");
  });
  repo.createUserTask.mockImplementation(async (input: Parameters<typeof checkTaskInput>[1]) => {
    checkTaskInput(null, input);
    return detail({ ...userTask, phaseId: input.phaseId ?? null, spaceId: input.spaceId ?? null });
  });
  repo.createSubtask.mockImplementation(
    async (parentId: string, input: { spaceId?: string | null; managerId?: string | null }) => {
      const parent = rowFor(parentId);
      if (parent.kind === "admin" && input.managerId === COLLABORATOR) throw new Error("ASSIGNEE_NOT_ADMIN");
      if (parent.kind !== "admin" && input.spaceId === OTHER_SPACE) throw new Error("SPACE_MISMATCH");
      return detail({
        ...parent,
        id: "c1",
        spaceId: parent.kind === "admin" ? null : (input.spaceId ?? null),
      });
    }
  );
  repo.updateTask.mockImplementation(
    async (id: string, patch: Parameters<typeof checkTaskInput>[1], _actor: string, opts?: { canMoveTramo?: boolean }) => {
      checkTaskInput(rowFor(id), patch, opts);
      return detail({ ...rowFor(id), ...(patch as Partial<Row>) });
    }
  );
  repo.taskWorkflowId.mockImplementation(async (id: string) => rowFor(id).workflowId);
  repo.setTaskStatus.mockImplementation(async (id: string) => detail(rowFor(id)));
  repo.setTaskCustomStatus.mockImplementation(async (id: string) => detail(rowFor(id)));
  repo.assignTask.mockImplementation(async (id: string, managerId: string | null) => {
    if (id === ADMIN_TASK && managerId === COLLABORATOR) throw new Error("ASSIGNEE_NOT_ADMIN");
    return detail(rowFor(id));
  });
  repo.setTaskSupport.mockImplementation(async (id: string, staffIds: string[]) => {
    if (id === ADMIN_TASK && staffIds.includes(COLLABORATOR)) throw new Error("ASSIGNEE_NOT_ADMIN");
    return [];
  });
  repo.listAdminTasks.mockResolvedValue([detail(adminTask)]);
  repo.createAdminTask.mockImplementation(
    async (input: { projectId: string; managerId?: string | null; supportIds?: string[] }) => {
      if (input.projectId === OTHER_PROJECT) throw new Error("NOT_FOUND");
      if (input.managerId === COLLABORATOR || input.supportIds?.includes(COLLABORATOR)) {
        throw new Error("ASSIGNEE_NOT_ADMIN");
      }
      return detail(adminTask);
    }
  );
});

describe("task reads: filters, viewer scope and order", () => {
  it("passes phaseId, spaceId and kind filters with the viewer scope", async () => {
    const filters = { workflowId: WORKFLOW, phaseId: PHASE, spaceId: SPACE };
    await fetchTasksAction(filters);
    const [sent, viewer] = repo.listTasks.mock.calls[0];
    expect(sent).toMatchObject(filters);
    expect(viewer).toMatchObject({ staffId: ACTOR, isAdmin: false });
  });

  it("marks an administrator's scope as admin", async () => {
    session.access = "Administrador";
    await fetchTasksAction({ kind: "admin" });
    const [sent, viewer] = repo.listTasks.mock.calls[0];
    expect(sent).toMatchObject({ kind: "admin" });
    expect(viewer).toMatchObject({ staffId: ACTOR, isAdmin: true });
  });

  it("never lets a non-admin read admin tasks by asking for them", async () => {
    await fetchTasksAction({ kind: "admin" });
    const [sent, viewer] = repo.listTasks.mock.calls[0];
    const kinds = ([] as string[]).concat((sent?.kind as string | string[] | undefined) ?? []);
    // Either the action drops the admin kind, or the repository gets a non-admin scope that filters it out.
    expect(kinds.includes("admin") ? viewer?.isAdmin : false).toBe(false);
  });

  it("passes the viewer scope to my tasks and calendar", async () => {
    await fetchMyTasksAction({ phaseId: PHASE });
    await fetchCalendarAction("2026-11-01", "2026-11-30", { phaseId: PHASE });

    expect(repo.listMyTasks.mock.calls[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ phaseId: PHASE })])
    );
    expect(JSON.stringify(repo.listMyTasks.mock.calls[0])).toContain(ACTOR);
    expect(repo.listCalendar.mock.calls[0]).toEqual(
      expect.arrayContaining([
        "2026-11-01",
        "2026-11-30",
        expect.objectContaining({ phaseId: PHASE }),
        expect.objectContaining({ staffId: ACTOR, isAdmin: false }),
      ])
    );
  });

  it("keeps the repository order (tramo, fase, sort order)", async () => {
    const ordered = [
      detail({ ...userTask, id: "t1" }),
      detail({ ...userTask, id: "t2", phaseId: OTHER_PHASE }),
      detail({ ...userTask, id: "t3", phaseId: null }),
    ];
    repo.listTasks.mockResolvedValue(ordered);
    const rows = await fetchTasksAction({ workflowId: WORKFLOW });
    expect(rows.map((r) => r.id)).toEqual(["t1", "t2", "t3"]);
  });
});

describe("createUserTaskAction", () => {
  it("creates a task in a fase of its tramo and an espacio of its project", async () => {
    const row = await createUserTaskAction({
      projectId: PROJECT,
      title: "Medir muros",
      workflowId: WORKFLOW,
      phaseId: PHASE,
      spaceId: SPACE,
    });
    expect(row).toMatchObject({ workflowId: WORKFLOW, phaseId: PHASE, spaceId: SPACE });
  });

  it("throws INVALID without a tramo", async () => {
    await expect(createUserTaskAction({ projectId: PROJECT, title: "Medir muros" } as UserTaskInput)).rejects.toThrow(
      /^INVALID/
    );
  });

  it("throws PHASE_MISMATCH for a fase of another tramo", async () => {
    await expect(
      createUserTaskAction({ projectId: PROJECT, title: "x", workflowId: WORKFLOW, phaseId: OTHER_PHASE })
    ).rejects.toThrow(/^PHASE_MISMATCH/);
  });

  it("throws SPACE_MISMATCH for an espacio of another project", async () => {
    await expect(
      createUserTaskAction({ projectId: PROJECT, title: "x", workflowId: WORKFLOW, spaceId: OTHER_SPACE })
    ).rejects.toThrow(/^SPACE_MISMATCH/);
  });
});

describe("updateTaskAction", () => {
  it("moves a task to a fase and an espacio", async () => {
    await expect(updateTaskAction(TASK, { phaseId: PHASE, spaceId: SPACE })).resolves.toMatchObject({
      phaseId: PHASE,
      spaceId: SPACE,
    });
  });

  it("throws PHASE_MISMATCH for a fase outside the task's tramo", async () => {
    await expect(updateTaskAction(TASK, { phaseId: OTHER_PHASE })).rejects.toThrow(/^PHASE_MISMATCH/);
  });

  it("throws SPACE_MISMATCH for an espacio of another project", async () => {
    await expect(updateTaskAction(TASK, { spaceId: OTHER_SPACE })).rejects.toThrow(/^SPACE_MISMATCH/);
  });

  describe("moving a task to another tramo", () => {
    it("is FORBIDDEN for a non-admin", async () => {
      await expect(updateTaskAction(TASK, { workflowId: OTHER_WORKFLOW })).rejects.toThrow(
        TASK_TRAMO_CHANGE_FORBIDDEN
      );
      expect(repo.updateTask).toHaveBeenCalledWith(TASK, { workflowId: OTHER_WORKFLOW }, ACTOR, {
        canMoveTramo: false,
      });
    });

    it("lets an admin move it and refreshes both tramos' closing state", async () => {
      session.access = "Administrador";
      await expect(updateTaskAction(TASK, { workflowId: OTHER_WORKFLOW })).resolves.toMatchObject({
        workflowId: OTHER_WORKFLOW,
      });
      expect(repo.updateTask).toHaveBeenCalledWith(TASK, { workflowId: OTHER_WORKFLOW }, ACTOR, {
        canMoveTramo: true,
      });
      await runAfter();
      const pairs = hooks.onTaskClosingChanged.mock.calls.map((c) => (c as unknown[]).slice(1, 3));
      expect(pairs).toEqual([
        [PROJECT, OTHER_WORKFLOW],
        [PROJECT, WORKFLOW],
      ]);
    });

    it("throws INVALID for an unknown tramo, ADMIN_TASK on an admin task", async () => {
      session.access = "Administrador";
      await expect(updateTaskAction(TASK, { workflowId: UNKNOWN_WORKFLOW })).rejects.toThrow(/^INVALID/);
      await expect(updateTaskAction(ADMIN_TASK, { workflowId: OTHER_WORKFLOW })).rejects.toThrow(/^ADMIN_TASK/);
    });

    it("sending the current tramo again schedules no closing hook", async () => {
      await updateTaskAction(TASK, { workflowId: WORKFLOW });
      await runAfter();
      expect(hooks.onTaskClosingChanged).not.toHaveBeenCalled();
    });
  });

  describe("on an admin task", () => {
    beforeEach(() => {
      session.access = "Administrador";
    });

    it("throws ADMIN_TASK for a fase or an espacio", async () => {
      await expect(updateTaskAction(ADMIN_TASK, { phaseId: PHASE })).rejects.toThrow(/^ADMIN_TASK/);
      await expect(updateTaskAction(ADMIN_TASK, { spaceId: SPACE })).rejects.toThrow(/^ADMIN_TASK/);
    });

    it("throws ASSIGNEE_NOT_ADMIN for a non-admin manager", async () => {
      await expect(updateTaskAction(ADMIN_TASK, { managerId: COLLABORATOR })).rejects.toThrow(
        /^ASSIGNEE_NOT_ADMIN/
      );
    });

    it("is FORBIDDEN for a non-admin", async () => {
      session.access = "Colaborador";
      await expect(updateTaskAction(ADMIN_TASK, { title: "Otra" })).rejects.toThrow(/^FORBIDDEN/);
    });
  });
});

describe("createSubtaskAction", () => {
  it("inherits the parent's tramo, fase and kind", async () => {
    const child = await createSubtaskAction(TASK, { title: "Medir muros" });
    expect(child).toMatchObject({ projectId: PROJECT, workflowId: WORKFLOW, phaseId: PHASE, kind: "usuario" });
    // The child input carries no tramo or fase of its own: they come from the parent.
    const [, input] = repo.createSubtask.mock.calls[0];
    expect(input).not.toHaveProperty("workflowId");
    expect(input).not.toHaveProperty("phaseId");
  });

  it("accepts an espacio of the project", async () => {
    await expect(createSubtaskAction(TASK, { title: "x", spaceId: SPACE })).resolves.toMatchObject({
      spaceId: SPACE,
    });
  });

  it("throws SPACE_MISMATCH for an espacio of another project", async () => {
    await expect(createSubtaskAction(TASK, { title: "x", spaceId: OTHER_SPACE })).rejects.toThrow(
      /^SPACE_MISMATCH/
    );
  });

  it("makes an admin child of an admin parent, with admin assignees only", async () => {
    session.access = "Administrador";
    await expect(createSubtaskAction(ADMIN_TASK, { title: "x" })).resolves.toMatchObject({
      kind: "admin",
      workflowId: null,
      phaseId: null,
    });
    await expect(createSubtaskAction(ADMIN_TASK, { title: "x", managerId: COLLABORATOR })).rejects.toThrow(
      /^ASSIGNEE_NOT_ADMIN/
    );
  });
});

describe("assignTaskAction / setTaskSupportAction", () => {
  beforeEach(() => {
    session.access = "Administrador";
  });

  it("throws ASSIGNEE_NOT_ADMIN for a non-admin on an admin task", async () => {
    await expect(assignTaskAction(ADMIN_TASK, COLLABORATOR)).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
    await expect(setTaskSupportAction(ADMIN_TASK, [COLLABORATOR])).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
  });

  it("allows any staff on a user task", async () => {
    await expect(assignTaskAction(TASK, COLLABORATOR)).resolves.toMatchObject({ id: TASK });
    await expect(setTaskSupportAction(TASK, [COLLABORATOR])).resolves.toBeDefined();
  });
});

describe("admin task actions", () => {
  it("are FORBIDDEN for non-admins", async () => {
    await expect(fetchAdminTasksAction()).rejects.toThrow(/^FORBIDDEN/);
    await expect(createAdminTaskAction({ projectId: PROJECT, title: "Cobrar anticipo" })).rejects.toThrow(
      /^FORBIDDEN/
    );
    expect(repo.listAdminTasks).not.toHaveBeenCalled();
    expect(repo.createAdminTask).not.toHaveBeenCalled();
  });

  it("list and create admin tasks for an administrator", async () => {
    session.access = "Administrador";
    await expect(fetchAdminTasksAction({ projectId: PROJECT })).resolves.toHaveLength(1);
    await expect(
      createAdminTaskAction({ projectId: PROJECT, title: "Cobrar anticipo" })
    ).resolves.toMatchObject({ kind: "admin" });
  });

  it("throws NOT_FOUND and ASSIGNEE_NOT_ADMIN on create", async () => {
    session.access = "Administrador";
    await expect(createAdminTaskAction({ projectId: OTHER_PROJECT, title: "x" })).rejects.toThrow(
      /^NOT_FOUND/
    );
    await expect(
      createAdminTaskAction({ projectId: PROJECT, title: "x", managerId: COLLABORATOR })
    ).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN/);
  });
});

describe("closing hook after status changes", () => {
  function expectHook() {
    expect(hooks.onTaskClosingChanged).toHaveBeenCalledTimes(1);
    const args = hooks.onTaskClosingChanged.mock.calls[0] as unknown[];
    expect(args.slice(1, 3)).toEqual([PROJECT, WORKFLOW]);
  }

  it("runs after setTaskStatusAction, not before the response", async () => {
    await setTaskStatusAction(TASK, "completado");
    expect(hooks.onTaskClosingChanged).not.toHaveBeenCalled();
    await runAfter();
    expectHook();
  });

  it("runs after setTaskCustomStatusAction", async () => {
    await setTaskCustomStatusAction(TASK, STATUS);
    await runAfter();
    expectHook();
  });

  it("runs after updateTaskAction with a status", async () => {
    await updateTaskAction(TASK, { status: "completado" });
    await runAfter();
    expectHook();
  });

  it("does not run after updateTaskAction without a status", async () => {
    await updateTaskAction(TASK, { title: "Otro título" });
    await runAfter();
    expect(hooks.onTaskClosingChanged).not.toHaveBeenCalled();
  });
});
