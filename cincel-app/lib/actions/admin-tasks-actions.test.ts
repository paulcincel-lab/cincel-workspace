import { unwrapActions } from "@/tests/helpers/action-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";
const TASK = "55555555-5555-4555-8555-555555555555";
const OTHER = "66666666-6666-4666-8666-666666666666";

const session = vi.hoisted(() => ({ access: "Administrador" }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "33333333-3333-4333-8333-333333333333" },
    access: session.access,
  })),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({
    canCreateActivity: true,
    canViewActivities: true,
    canChangeResponsible: true,
    canDeleteActivity: true,
    statusScope: "all",
  }),
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const repo = vi.hoisted(() => ({
  listAdminTasks: vi.fn(),
  createAdminTask: vi.fn(),
  updateTask: vi.fn(),
  assignTask: vi.fn(),
  setTaskSupport: vi.fn(),
  createSubtask: vi.fn(),
  mergeTasks: vi.fn(),
  assertTaskVisible: vi.fn(),
  getTask: vi.fn(),
}));
vi.mock("@/lib/repositories/tasks-repository", () => repo);

import * as tasksActionsModule from "./tasks-actions";
const {
  assignTaskAction,
  createAdminTaskAction,
  createSubtaskAction,
  fetchAdminTasksAction,
  mergeTasksAction,
  setTaskSupportAction,
  updateTaskAction,
} = unwrapActions(tasksActionsModule);

beforeEach(() => {
  vi.clearAllMocks();
  session.access = "Administrador";
  repo.listAdminTasks.mockResolvedValue([]);
  repo.createAdminTask.mockResolvedValue({ id: TASK, projectId: PROJECT, kind: "admin" });
});

describe("fetchAdminTasksAction", () => {
  it("lists admin tasks for an administrator", async () => {
    await expect(fetchAdminTasksAction({ projectId: PROJECT, includeClosed: true })).resolves.toEqual([]);
    expect(repo.listAdminTasks).toHaveBeenCalledWith({ projectId: PROJECT, includeClosed: true });
  });

  it("defaults to no filters", async () => {
    await fetchAdminTasksAction();
    expect(repo.listAdminTasks).toHaveBeenCalledWith({});
  });

  it.each(["Colaborador", "Dirección"])("throws FORBIDDEN for %s", async (access) => {
    session.access = access;
    await expect(fetchAdminTasksAction()).rejects.toThrow(/^FORBIDDEN$/);
    expect(repo.listAdminTasks).not.toHaveBeenCalled();
  });

  it("rejects a malformed project id as INVALID", async () => {
    await expect(fetchAdminTasksAction({ projectId: "nope" })).rejects.toThrow(/^INVALID: projectId$/);
    expect(repo.listAdminTasks).not.toHaveBeenCalled();
  });
});

describe("createAdminTaskAction", () => {
  it("creates the task as the session user and revalidates", async () => {
    const row = await createAdminTaskAction({ projectId: PROJECT, title: "  Asignar cliente  ", managerId: ACTOR });
    expect(row).toMatchObject({ id: TASK, kind: "admin" });
    expect(repo.createAdminTask).toHaveBeenCalledWith(
      { projectId: PROJECT, title: "Asignar cliente", managerId: ACTOR },
      ACTOR
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/proyectos/${PROJECT}/ficha`);
    expect(revalidatePath).toHaveBeenCalledWith("/actividades", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("throws FORBIDDEN for a non-administrator", async () => {
    session.access = "Colaborador";
    await expect(createAdminTaskAction({ projectId: PROJECT, title: "x" })).rejects.toThrow(/^FORBIDDEN$/);
    expect(repo.createAdminTask).not.toHaveBeenCalled();
  });

  it("rejects an empty title and a bad project id as INVALID", async () => {
    await expect(createAdminTaskAction({ projectId: PROJECT, title: "  " })).rejects.toThrow(/^INVALID: title$/);
    await expect(createAdminTaskAction({ projectId: "x", title: "Tarea" })).rejects.toThrow(/^INVALID: projectId$/);
    expect(repo.createAdminTask).not.toHaveBeenCalled();
  });

  it("passes NOT_FOUND and ASSIGNEE_NOT_ADMIN through", async () => {
    repo.createAdminTask.mockRejectedValueOnce(new Error("NOT_FOUND"));
    await expect(createAdminTaskAction({ projectId: PROJECT, title: "x" })).rejects.toThrow(/^NOT_FOUND$/);
    repo.createAdminTask.mockRejectedValueOnce(new Error("ASSIGNEE_NOT_ADMIN"));
    await expect(createAdminTaskAction({ projectId: PROJECT, title: "x", supportIds: [OTHER] })).rejects.toThrow(
      /^ASSIGNEE_NOT_ADMIN$/
    );
  });
});

describe("admin task rules surface through the task actions", () => {
  it("updateTaskAction: ADMIN_TASK and ASSIGNEE_NOT_ADMIN", async () => {
    repo.updateTask.mockRejectedValueOnce(new Error("ADMIN_TASK"));
    await expect(updateTaskAction(TASK, { phaseId: OTHER })).rejects.toThrow(/^ADMIN_TASK$/);
    repo.updateTask.mockRejectedValueOnce(new Error("ADMIN_TASK"));
    await expect(updateTaskAction(TASK, { spaceId: OTHER })).rejects.toThrow(/^ADMIN_TASK$/);
    repo.updateTask.mockRejectedValueOnce(new Error("ASSIGNEE_NOT_ADMIN"));
    await expect(updateTaskAction(TASK, { managerId: OTHER })).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN$/);
  });

  it("assignTaskAction: ASSIGNEE_NOT_ADMIN", async () => {
    repo.assignTask.mockRejectedValueOnce(new Error("ASSIGNEE_NOT_ADMIN"));
    await expect(assignTaskAction(TASK, OTHER)).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN$/);
  });

  it("setTaskSupportAction: ASSIGNEE_NOT_ADMIN", async () => {
    repo.setTaskSupport.mockRejectedValueOnce(new Error("ASSIGNEE_NOT_ADMIN"));
    await expect(setTaskSupportAction(TASK, [OTHER])).rejects.toThrow(/^ASSIGNEE_NOT_ADMIN$/);
  });

  it("createSubtaskAction: ASSIGNEE_NOT_ADMIN", async () => {
    repo.createSubtask.mockRejectedValueOnce(new Error("ASSIGNEE_NOT_ADMIN"));
    await expect(createSubtaskAction(TASK, { title: "Hija", managerId: OTHER })).rejects.toThrow(
      /^ASSIGNEE_NOT_ADMIN$/
    );
  });

  it("mergeTasksAction: mixed kinds are refused as INVALID", async () => {
    repo.mergeTasks.mockRejectedValueOnce(new Error("INVALID: kind"));
    await expect(mergeTasksAction(TASK, [OTHER])).rejects.toThrow(/^INVALID: kind$/);
  });
});
