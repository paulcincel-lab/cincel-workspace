import { unwrapActions } from "@/tests/helpers/action-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const MANAGER = "44444444-4444-4444-8444-444444444444";
const MENTIONED = "55555555-5555-4555-8555-555555555555";
const ADMIN = "66666666-6666-4666-8666-666666666666";
const PROJECT = "77777777-7777-4777-8777-777777777777";
const TASK = "88888888-8888-4888-8888-888888888888";
const WORKFLOW = "99999999-9999-4999-8999-999999999999";
const EVENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, access: "Administrador" })),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({
    statusScope: "all",
    canChangeResponsible: true,
    canCreateActivity: true,
    canViewActivities: true,
    canDeleteActivity: true,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const after = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-request-id": "req-9" })) }));

vi.mock("@/lib/db/client", () => ({ db: { tag: "db" } }));
vi.mock("@/lib/project-flow/auto-start", () => ({ onTaskClosingChanged: vi.fn() }));

const notify = vi.hoisted(() => vi.fn());
vi.mock("@/lib/notifications/notify", () => ({ notify }));

type StaffRow = { id: string; name: string; lastName: string | null; role: string | null; email: string | null };
const STAFF: StaffRow[] = [
  { id: ACTOR, name: "Paula", lastName: "Ríos", role: "Administrador", email: null },
  { id: MANAGER, name: "Marco", lastName: "Gómez", role: "Colaborador", email: null },
  { id: MENTIONED, name: "Lucía", lastName: "Hernández", role: "Colaborador", email: null },
  { id: ADMIN, name: "Andrés", lastName: "Soto", role: "Administrador", email: null },
];

const data = vi.hoisted(() => ({
  loadTaskNotifyTarget: vi.fn(),
  loadNotifiableStaff: vi.fn(),
}));
vi.mock("@/lib/tasks/task-notifications-data", () => data);

const repo = vi.hoisted(() => ({
  assertTaskVisible: vi.fn(async () => undefined),
  assignTask: vi.fn(),
  createUserTask: vi.fn(),
  addTaskComment: vi.fn(),
}));
vi.mock("@/lib/repositories/tasks-repository", () => repo);
vi.mock("@/lib/repositories/task-dependencies-repository", () => ({}));

import * as tasksActionsModule from "./tasks-actions";
const { addTaskCommentAction, assignTaskAction, createUserTaskAction } = unwrapActions(tasksActionsModule);

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK,
    projectId: PROJECT,
    workflowId: WORKFLOW,
    kind: "usuario",
    title: "Medir muros",
    managerId: MANAGER,
    status: "pendiente",
    project: { id: PROJECT, name: "Casa", clientName: null },
    ...overrides,
  };
}

async function runScheduled() {
  for (const [callback] of after.mock.calls) await (callback as () => Promise<void>)();
}

function notifiedKinds() {
  return notify.mock.calls.map(([, staffIds, payload]) => ({ kind: payload.kind, staffIds }));
}

beforeEach(() => {
  vi.clearAllMocks();
  notify.mockResolvedValue({ created: 1 });
  data.loadNotifiableStaff.mockImplementation(async (ids?: string[]) =>
    ids ? STAFF.filter((person) => ids.includes(person.id)) : STAFF
  );
  data.loadTaskNotifyTarget.mockResolvedValue({ id: TASK, title: "Medir muros", kind: "usuario", managerId: MANAGER });
  repo.assignTask.mockImplementation(async (_id: string, managerId: string | null) => taskRow({ managerId }));
  repo.createUserTask.mockImplementation(async () => taskRow());
  repo.addTaskComment.mockImplementation(async (_taskId: string, comment: string) => ({
    id: EVENT,
    entity: "task",
    entityId: TASK,
    kind: "comentario",
    comment,
  }));
});

describe("assignTaskAction notify hook", () => {
  it("schedules notify in after() and sends one asignacion to the new manager", async () => {
    await assignTaskAction(TASK, MANAGER);

    expect(after).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
    await runScheduled();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({ tag: "db" }, [MANAGER], {
      kind: "asignacion",
      title: "Te asignaron una tarea",
      body: "Medir muros",
      dedupeKey: `asignacion:${TASK}:${MANAGER}`,
      entity: "task",
      entityId: TASK,
      url: `/tareas?tarea=${TASK}`,
      actorId: ACTOR,
    });
  });

  it("does not notify the actor assigning to themselves", async () => {
    await assignTaskAction(TASK, ACTOR);
    await runScheduled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not notify when the manager is cleared", async () => {
    await assignTaskAction(TASK, null);
    await runScheduled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("admin tasks notify administrators only", async () => {
    repo.assignTask.mockImplementation(async (_id: string, managerId: string | null) =>
      taskRow({ kind: "admin", workflowId: null, managerId })
    );

    await assignTaskAction(TASK, MANAGER);
    await runScheduled();
    expect(notify).not.toHaveBeenCalled();

    after.mockClear();
    await assignTaskAction(TASK, ADMIN);
    await runScheduled();
    expect(notifiedKinds()).toEqual([{ kind: "asignacion", staffIds: [ADMIN] }]);
  });

  it("a notify failure is logged as notify.failed and never fails the action", async () => {
    notify.mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(assignTaskAction(TASK, MANAGER)).resolves.toMatchObject({ id: TASK });
    await expect(runScheduled()).resolves.toBeUndefined();

    const line = JSON.parse(String(error.mock.calls.at(-1)?.[0]));
    expect(line).toMatchObject({ msg: "notify.failed", trace_id: "req-9", kind: "asignacion", count: 1 });
    error.mockRestore();
  });

  it("does not schedule notify when the write fails", async () => {
    repo.assignTask.mockRejectedValue(new Error("ASSIGNEE_NOT_ADMIN"));
    await expect(assignTaskAction(TASK, MANAGER)).rejects.toThrow("ASSIGNEE_NOT_ADMIN");
    expect(after).not.toHaveBeenCalled();
  });
});

describe("createUserTaskAction notify hook", () => {
  it("sends one asignacion to the manager of the new task", async () => {
    await createUserTaskAction({ projectId: PROJECT, title: "Medir muros", workflowId: WORKFLOW, managerId: MANAGER });

    expect(after).toHaveBeenCalledTimes(1);
    await runScheduled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notifiedKinds()).toEqual([{ kind: "asignacion", staffIds: [MANAGER] }]);
    expect(notify.mock.calls[0][2]).toMatchObject({ dedupeKey: `asignacion:${TASK}:${MANAGER}`, actorId: ACTOR });
  });

  it("sends nothing when the creator is the manager or there is none", async () => {
    repo.createUserTask.mockResolvedValueOnce(taskRow({ managerId: ACTOR }));
    await createUserTaskAction({ projectId: PROJECT, title: "x", workflowId: WORKFLOW, managerId: ACTOR });
    repo.createUserTask.mockResolvedValueOnce(taskRow({ managerId: null }));
    await createUserTaskAction({ projectId: PROJECT, title: "y", workflowId: WORKFLOW });

    await runScheduled();
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("addTaskCommentAction notify hook", () => {
  it("notifies the manager with comentario", async () => {
    await addTaskCommentAction(TASK, "Listo el plano");

    expect(after).toHaveBeenCalledTimes(1);
    await runScheduled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      { tag: "db" },
      [MANAGER],
      expect.objectContaining({
        kind: "comentario",
        dedupeKey: `comentario:${EVENT}`,
        entity: "task",
        entityId: TASK,
        url: `/tareas?tarea=${TASK}`,
        actorId: ACTOR,
      })
    );
  });

  it("notifies each mentioned person once with mencion, plus the manager with comentario", async () => {
    await addTaskCommentAction(TASK, "@lucia hernandez revisa, y otra vez @Lucía Hernández");
    await runScheduled();

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notifiedKinds()).toEqual([
      { kind: "mencion", staffIds: [MENTIONED] },
      { kind: "comentario", staffIds: [MANAGER] },
    ]);
  });

  it("a mentioned manager gets only the mencion", async () => {
    await addTaskCommentAction(TASK, "@Marco Gómez ¿lo ves?");
    await runScheduled();
    expect(notifiedKinds()).toEqual([{ kind: "mencion", staffIds: [MANAGER] }]);
  });

  it("never notifies the actor, even when they manage the task or mention themselves", async () => {
    data.loadTaskNotifyTarget.mockResolvedValue({ id: TASK, title: "Medir muros", kind: "usuario", managerId: ACTOR });
    await addTaskCommentAction(TASK, "Nota para mí @Paula Ríos");
    await runScheduled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("admin tasks notify administrators only", async () => {
    data.loadTaskNotifyTarget.mockResolvedValue({ id: TASK, title: "Cobro", kind: "admin", managerId: MANAGER });
    await addTaskCommentAction(TASK, "@Lucía Hernández @Andrés Soto revisen");
    await runScheduled();
    expect(notifiedKinds()).toEqual([{ kind: "mencion", staffIds: [ADMIN] }]);
  });

  it("a failing load is logged and never reaches the user", async () => {
    data.loadNotifiableStaff.mockRejectedValue(new Error("timeout"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(addTaskCommentAction(TASK, "Hola")).resolves.toMatchObject({ id: EVENT });
    await expect(runScheduled()).resolves.toBeUndefined();

    expect(notify).not.toHaveBeenCalled();
    expect(JSON.parse(String(error.mock.calls.at(-1)?.[0]))).toMatchObject({ msg: "notify.failed", trace_id: "req-9" });
    error.mockRestore();
  });
});
