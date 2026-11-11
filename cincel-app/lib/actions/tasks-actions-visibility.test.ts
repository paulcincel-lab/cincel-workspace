import { unwrapActions } from "@/tests/helpers/action-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Viewer scope in the task actions (project flow BE §7.5, §12): every
 * task-scoped read and write goes through the visibility guard, so a crafted
 * call on an admin task gets FORBIDDEN (writes) or null / [] (reads) for a
 * non-administrator, and mutation results carry no client name for them.
 */

const ACTOR = "33333333-3333-4333-8333-333333333333";
const ADMIN_TASK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_TASK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LINK = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const session = vi.hoisted(() => ({ access: "Colaborador" }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, email: "a@cincel.mx", access: session.access })),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({
    canViewActivities: true,
    canCreateActivity: true,
    canDeleteActivity: true,
    canChangeResponsible: true,
    canReorderPhases: true,
    statusScope: "all",
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const detail = { id: USER_TASK, projectId: "p1", project: { id: "p1", name: "Casa", clientName: "Cliente" } };

const repo = vi.hoisted(() => {
  const isAdminTask = (id: string) => id === "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  return {
    assertTaskVisible: vi.fn(async (id: string, viewer: { isAdmin: boolean }) => {
      if (!viewer.isAdmin && isAdminTask(id)) throw new Error("FORBIDDEN");
    }),
    isTaskVisible: vi.fn(async (id: string, viewer: { isAdmin: boolean }) => viewer.isAdmin || !isAdminTask(id)),
    taskLinkTaskId: vi.fn(async () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    getTaskForViewer: vi.fn(async () => null),
    listTasks: vi.fn(async () => []),
    listMyTasks: vi.fn(async () => []),
    listCalendar: vi.fn(async () => []),
    listSubtasks: vi.fn(async () => []),
    listTaskHistory: vi.fn(async () => [{ id: "h1" }]),
    updateTask: vi.fn(async () => detail),
    setTaskStatus: vi.fn(async () => detail),
    setTaskCustomStatus: vi.fn(async () => detail),
    assignTask: vi.fn(async () => detail),
    setTaskArchived: vi.fn(async () => detail),
    softDeleteTask: vi.fn(async () => undefined),
    restoreTask: vi.fn(async () => undefined),
    mergeTasks: vi.fn(async () => detail),
    setTaskSupport: vi.fn(async () => []),
    addChecklistItem: vi.fn(async () => ({})),
    updateChecklistItem: vi.fn(async () => ({})),
    removeChecklistItem: vi.fn(async () => undefined),
    reorderChecklist: vi.fn(async () => undefined),
    reorderProjectTasks: vi.fn(async () => undefined),
    reorderTasks: vi.fn(async () => undefined),
    addTaskComment: vi.fn(async () => ({})),
    addTaskAttachment: vi.fn(async () => ({})),
    addTaskLink: vi.fn(async () => ({})),
    removeTaskLink: vi.fn(async () => undefined),
    createSubtask: vi.fn(async () => detail),
  };
});
vi.mock("@/lib/repositories/tasks-repository", () => repo);

const deps = vi.hoisted(() => ({
  addTaskDependency: vi.fn(),
  removeTaskDependency: vi.fn(),
  listTaskDependencies: vi.fn(async () => ({ dependsOn: [], blocks: [] })),
  getTaskProjectId: vi.fn(async () => "p1"),
}));
vi.mock("@/lib/repositories/task-dependencies-repository", () => deps);

import * as actionsModule from "./tasks-actions";
const actions = unwrapActions(actionsModule);

const MEMBER_SCOPE = { staffId: ACTOR, isAdmin: false };
const ADMIN_SCOPE = { staffId: ACTOR, isAdmin: true };

beforeEach(() => {
  vi.clearAllMocks();
  session.access = "Colaborador";
});

const file = () => {
  const form = new FormData();
  form.set("file", new File(["x"], "a.txt", { type: "text/plain" }));
  return form;
};

const writes: Array<[string, () => Promise<unknown>]> = [
  ["updateTaskAction", () => actions.updateTaskAction(ADMIN_TASK, { title: "x" })],
  ["setTaskStatusAction", () => actions.setTaskStatusAction(ADMIN_TASK, "completado")],
  ["setTaskCustomStatusAction", () => actions.setTaskCustomStatusAction(ADMIN_TASK, "s1")],
  ["assignTaskAction", () => actions.assignTaskAction(ADMIN_TASK, null)],
  ["archiveTaskAction", () => actions.archiveTaskAction(ADMIN_TASK, true)],
  ["deleteTaskAction", () => actions.deleteTaskAction(ADMIN_TASK)],
  ["restoreTaskAction", () => actions.restoreTaskAction(ADMIN_TASK)],
  ["mergeTasksAction", () => actions.mergeTasksAction(USER_TASK, [ADMIN_TASK])],
  ["setTaskSupportAction", () => actions.setTaskSupportAction(ADMIN_TASK, [])],
  ["reorderProjectTasksAction", () => actions.reorderProjectTasksAction("p1", [USER_TASK, ADMIN_TASK])],
  ["reorderTasksAction", () => actions.reorderTasksAction([ADMIN_TASK])],
  ["addTaskCommentAction", () => actions.addTaskCommentAction(ADMIN_TASK, "hola")],
  ["addTaskAttachmentAction", () => actions.addTaskAttachmentAction(ADMIN_TASK, file())],
  ["addTaskLinkAction", () => actions.addTaskLinkAction(ADMIN_TASK, { kind: "interno", title: "x", url: "https://x.mx" })],
  ["removeTaskLinkAction", () => actions.removeTaskLinkAction(LINK)],
  ["addTaskDependencyAction", () => actions.addTaskDependencyAction(USER_TASK, ADMIN_TASK)],
  ["removeTaskDependencyAction", () => actions.removeTaskDependencyAction(ADMIN_TASK, USER_TASK)],
  ["createSubtaskAction", () => actions.createSubtaskAction(ADMIN_TASK, { title: "x" })],
];

describe("writes on an admin task by a non-admin", () => {
  it.each(writes)("%s is FORBIDDEN", async (_name, call) => {
    await expect(call()).rejects.toThrow(/^FORBIDDEN$/);
  });

  it("never reaches the repository mutation", async () => {
    for (const [, call] of writes) await call().catch(() => undefined);
    for (const key of [
      "updateTask",
      "setTaskStatus",
      "setTaskCustomStatus",
      "assignTask",
      "setTaskArchived",
      "softDeleteTask",
      "restoreTask",
      "mergeTasks",
      "setTaskSupport",
      "reorderProjectTasks",
      "reorderTasks",
      "addTaskComment",
      "addTaskAttachment",
      "addTaskLink",
      "removeTaskLink",
      "createSubtask",
    ] as const) {
      expect(repo[key], key).not.toHaveBeenCalled();
    }
    expect(deps.addTaskDependency).not.toHaveBeenCalled();
    expect(deps.removeTaskDependency).not.toHaveBeenCalled();
  });

  it("an administrator passes the guard", async () => {
    session.access = "Administrador";
    await expect(actions.updateTaskAction(ADMIN_TASK, { title: "x" })).resolves.toBeTruthy();
    expect(repo.updateTask).toHaveBeenCalled();
  });
});

const RESULT_MUTATIONS = [
  "updateTaskAction",
  "setTaskStatusAction",
  "setTaskCustomStatusAction",
  "assignTaskAction",
  "deleteTaskAction",
  "addTaskCommentAction",
  "addTaskAttachmentAction",
  "addTaskDependencyAction",
  "removeTaskDependencyAction",
  "createSubtaskAction",
];

describe("ActionResult (user-facing mutations)", () => {
  const rawWrites: Array<[string, () => Promise<unknown>]> = [
    ["updateTaskAction", () => actionsModule.updateTaskAction(ADMIN_TASK, { title: "x" })],
    ["setTaskStatusAction", () => actionsModule.setTaskStatusAction(ADMIN_TASK, "completado")],
    ["setTaskCustomStatusAction", () => actionsModule.setTaskCustomStatusAction(ADMIN_TASK, "s1")],
    ["assignTaskAction", () => actionsModule.assignTaskAction(ADMIN_TASK, null)],
    ["deleteTaskAction", () => actionsModule.deleteTaskAction(ADMIN_TASK)],
    ["addTaskCommentAction", () => actionsModule.addTaskCommentAction(ADMIN_TASK, "hola")],
    ["addTaskAttachmentAction", () => actionsModule.addTaskAttachmentAction(ADMIN_TASK, file())],
    ["addTaskDependencyAction", () => actionsModule.addTaskDependencyAction(USER_TASK, ADMIN_TASK)],
    ["removeTaskDependencyAction", () => actionsModule.removeTaskDependencyAction(ADMIN_TASK, USER_TASK)],
    ["createSubtaskAction", () => actionsModule.createSubtaskAction(ADMIN_TASK, { title: "x" })],
  ];

  it("covers every user-facing mutation", () => {
    expect(rawWrites.map(([name]) => name)).toEqual(RESULT_MUTATIONS);
  });

  it.each(rawWrites)("%s returns { ok: false, error: 'FORBIDDEN' } instead of throwing", async (_name, call) => {
    await expect(call()).resolves.toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("a success returns { ok: true, data }", async () => {
    session.access = "Administrador";
    const result = await actionsModule.updateTaskAction(ADMIN_TASK, { title: "x" });
    expect(result).toMatchObject({ ok: true, data: expect.anything() });
  });

  it("read actions still return their value directly", async () => {
    await expect(actionsModule.fetchTaskHistoryAction(ADMIN_TASK)).resolves.toEqual([]);
  });
});

describe("reads of an admin task by a non-admin", () => {
  it("history, subtasks and dependencies are empty", async () => {
    await expect(actions.fetchTaskHistoryAction(ADMIN_TASK)).resolves.toEqual([]);
    await expect(actions.listSubtasksAction(ADMIN_TASK)).resolves.toEqual([]);
    await expect(actions.listTaskDependenciesAction(ADMIN_TASK)).resolves.toEqual({ dependsOn: [], blocks: [] });
    expect(repo.listTaskHistory).not.toHaveBeenCalled();
    expect(repo.listSubtasks).not.toHaveBeenCalled();
    expect(deps.listTaskDependencies).not.toHaveBeenCalled();
  });

  it("task detail goes through the viewer-scoped read", async () => {
    await expect(actions.fetchTaskAction(ADMIN_TASK)).resolves.toBeNull();
    expect(repo.getTaskForViewer).toHaveBeenCalledWith(ADMIN_TASK, MEMBER_SCOPE);
  });
});

describe("list reads pass the viewer scope", () => {
  it("as a non-admin", async () => {
    await actions.fetchTasksAction({ kind: "admin" });
    expect(repo.listTasks).toHaveBeenCalledWith({ kind: "admin" }, MEMBER_SCOPE);
    await actions.fetchMyTasksAction();
    expect(repo.listMyTasks).toHaveBeenCalledWith(ACTOR, {}, MEMBER_SCOPE);
    await actions.fetchCalendarAction("2030-01-01", "2030-01-31");
    expect(repo.listCalendar).toHaveBeenCalledWith("2030-01-01", "2030-01-31", {}, MEMBER_SCOPE);
  });

  it("as an administrator", async () => {
    session.access = "Administrador";
    await actions.fetchMyTasksAction();
    expect(repo.listMyTasks).toHaveBeenCalledWith(ACTOR, {}, ADMIN_SCOPE);
  });
});

describe("mutation results", () => {
  it("carry no client name for a non-admin", async () => {
    const row = await actions.updateTaskAction(USER_TASK, { title: "x" });
    expect(row.project.clientName).toBeNull();
  });

  it("keep the client name for an administrator", async () => {
    session.access = "Administrador";
    const row = await actions.updateTaskAction(USER_TASK, { title: "x" });
    expect(row.project.clientName).toBe("Cliente");
  });
});
