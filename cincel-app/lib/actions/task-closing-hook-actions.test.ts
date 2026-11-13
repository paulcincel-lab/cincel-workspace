import { unwrapActions } from "@/tests/helpers/action-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";
const PRESALE = "66666666-6666-4666-8666-666666666666";
const CANCELADO = "88888888-8888-4888-8888-888888888888";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, access: "Colaborador" })),
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
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-request-id": "req-7" })) }));

vi.mock("@/lib/db/client", () => ({ db: { tag: "db" } }));

const onTaskClosingChanged = vi.hoisted(() => vi.fn());
vi.mock("@/lib/project-flow/auto-start", () => ({ onTaskClosingChanged }));

const repo = vi.hoisted(() => ({
  setTaskStatus: vi.fn(),
  setTaskCustomStatus: vi.fn(),
  updateTask: vi.fn(),
  assertTaskVisible: vi.fn(async () => undefined),
}));
vi.mock("@/lib/repositories/tasks-repository", () => repo);
vi.mock("@/lib/repositories/task-dependencies-repository", () => ({}));

import * as tasksActionsModule from "./tasks-actions";
const { setTaskCustomStatusAction, setTaskStatusAction, updateTaskAction } = unwrapActions(tasksActionsModule);

function taskRow(id: string, workflowId: string | null = PRESALE) {
  return { id, projectId: PROJECT, workflowId, kind: "workflow", status: "completado", project: { id: PROJECT, name: "Casa", clientName: null } };
}

async function runScheduled() {
  for (const [callback] of after.mock.calls) await (callback as () => Promise<void>)();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  onTaskClosingChanged.mockResolvedValue(undefined);
  repo.setTaskStatus.mockImplementation(async (id: string) => taskRow(id));
  repo.setTaskCustomStatus.mockImplementation(async (id: string) => taskRow(id));
  repo.updateTask.mockImplementation(async (id: string) => taskRow(id));
});

describe("closing hook from the task status actions", () => {
  it("setTaskStatusAction (single change, Tablero drag) schedules onTaskClosingChanged after the response", async () => {
    await setTaskStatusAction("t1", "completado");

    expect(after).toHaveBeenCalledTimes(1);
    expect(onTaskClosingChanged).not.toHaveBeenCalled();
    await runScheduled();
    expect(onTaskClosingChanged).toHaveBeenCalledWith({ tag: "db" }, PROJECT, PRESALE, ACTOR);
  });

  it("reopening a task re-evaluates closing", async () => {
    repo.setTaskStatus.mockResolvedValue({ ...taskRow("t1"), status: "en_proceso" });

    await setTaskStatusAction("t1", "en_proceso");
    await runScheduled();

    expect(onTaskClosingChanged).toHaveBeenCalledWith({ tag: "db" }, PROJECT, PRESALE, ACTOR);
  });

  it("setTaskCustomStatusAction (custom status, Tablero drag to a custom column) schedules the hook", async () => {
    await setTaskCustomStatusAction("t1", CANCELADO);
    await runScheduled();

    expect(repo.setTaskCustomStatus).toHaveBeenCalledWith("t1", CANCELADO, ACTOR);
    expect(onTaskClosingChanged).toHaveBeenCalledWith({ tag: "db" }, PROJECT, PRESALE, ACTOR);
  });

  it("updateTaskAction schedules the hook when the patch changes the status", async () => {
    await updateTaskAction("t1", { status: "completado" });
    await runScheduled();

    expect(onTaskClosingChanged).toHaveBeenCalledWith({ tag: "db" }, PROJECT, PRESALE, ACTOR);
  });

  it("updateTaskAction without a status change does not schedule the hook", async () => {
    await updateTaskAction("t1", { title: "Planos" });

    expect(after).not.toHaveBeenCalled();
  });

  it("the bulk complete (one setTaskStatusAction per task) runs the hook for every change", async () => {
    await Promise.all(["t1", "t2", "t3"].map((id) => setTaskStatusAction(id, "completado")));
    await runScheduled();

    expect(repo.setTaskStatus).toHaveBeenCalledTimes(3);
    expect(onTaskClosingChanged).toHaveBeenCalledTimes(3);
    for (const call of onTaskClosingChanged.mock.calls) {
      expect(call).toEqual([{ tag: "db" }, PROJECT, PRESALE, ACTOR]);
    }
  });

  it("a task without an etapa (admin task) skips the hook", async () => {
    repo.setTaskStatus.mockResolvedValue(taskRow("t1", null));

    await setTaskStatusAction("t1", "completado");

    expect(after).not.toHaveBeenCalled();
  });

  it("a thrown error in the hook logs a JSON line with trace_id and the action still succeeds", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    onTaskClosingChanged.mockRejectedValue(new Error("lock timeout"));

    const row = await setTaskStatusAction("t1", "completado");
    await expect(runScheduled()).resolves.toBeUndefined();

    expect(row).toMatchObject({ id: "t1", status: "completado" });
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(error.mock.calls[0][0]))).toEqual({
      level: "error",
      msg: "task.closing_hook_failed",
      trace_id: "req-7",
      projectId: PROJECT,
      workflowId: PRESALE,
      err: "lock timeout",
    });
  });
});
