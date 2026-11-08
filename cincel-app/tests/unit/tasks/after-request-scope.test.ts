// @vitest-environment node
/**
 * #932: the `after()` callbacks of the Tareas mutations never call
 * `cookies()` / `headers()`. Everything request-scoped (actor, trace id) is
 * read before `after()` and passed in. The test runs every scheduled callback
 * with both request APIs throwing, the way Next.js does inside `after()`, and
 * checks the work still happens with the values read during the request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const MANAGER = "66666666-6666-4666-8666-666666666666";
const PROJECT = "44444444-4444-4444-8444-444444444444";
const WORKFLOW = "11111111-1111-4111-8111-111111111111";
const TASK = "55555555-5555-4555-8555-555555555555";
const EVENT = "77777777-7777-4777-8777-777777777777";
const REQUEST_ID = "req-932";

const phase = vi.hoisted(() => ({ after: false, requestApiCalls: [] as string[] }));

function requestApi(name: string) {
  phase.requestApiCalls.push(`${name}${phase.after ? " (after)" : ""}`);
  if (phase.after) throw new Error(`Route /tareas used \`${name}()\` inside \`after()\`.`);
}

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => {
    requestApi("cookies");
    return { get: () => undefined };
  }),
  headers: vi.fn(async () => {
    requestApi("headers");
    return new Headers({ "x-request-id": REQUEST_ID });
  }),
}));

const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, access: "Colaborador" })),
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

vi.mock("@/lib/db/client", () => ({ db: {} }));

const row = {
  id: TASK,
  title: "Revisar planos",
  kind: "usuario" as const,
  managerId: MANAGER,
  projectId: PROJECT,
  workflowId: WORKFLOW,
  project: { id: PROJECT, name: "Casa", clientName: null },
};

const repo = vi.hoisted(() => ({
  assertTaskVisible: vi.fn(async () => undefined),
  createUserTask: vi.fn(),
  assignTask: vi.fn(),
  setTaskStatus: vi.fn(),
  updateTask: vi.fn(),
  addTaskComment: vi.fn(),
}));
vi.mock("@/lib/repositories/tasks-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/tasks-repository")>()),
  ...repo,
}));

const notifyMock = vi.hoisted(() => vi.fn(async () => ({ created: 1 })));
vi.mock("@/lib/notifications/notify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notifications/notify")>()),
  notify: notifyMock,
}));

vi.mock("@/lib/tasks/task-notifications-data", () => ({
  loadTaskNotifyTarget: vi.fn(async () => ({ id: TASK, title: row.title, kind: row.kind, managerId: MANAGER })),
  loadNotifiableStaff: vi.fn(async () => [
    { id: MANAGER, name: "Ana", lastName: "López", role: "Colaborador", email: "ana@test.local" },
  ]),
}));

const flow = vi.hoisted(() => ({ onTaskClosingChanged: vi.fn(async () => undefined) }));
vi.mock("@/lib/project-flow/auto-start", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/project-flow/auto-start")>()),
  ...flow,
}));

import {
  addTaskCommentAction,
  assignTaskAction,
  createUserTaskAction,
  setTaskStatusAction,
  updateTaskAction,
} from "@/lib/actions/tasks-actions";

/** Runs the scheduled callbacks the way Next.js does: request APIs throw from here on. */
async function runAfterCallbacks() {
  phase.after = true;
  const callbacks = afterCallbacks.splice(0);
  expect(callbacks.length).toBeGreaterThan(0);
  for (const callback of callbacks) await callback();
}

beforeEach(() => {
  phase.after = false;
  phase.requestApiCalls = [];
  afterCallbacks.length = 0;
  notifyMock.mockClear();
  flow.onTaskClosingChanged.mockClear();
  repo.createUserTask.mockResolvedValue(row);
  repo.assignTask.mockResolvedValue(row);
  repo.setTaskStatus.mockResolvedValue(row);
  repo.updateTask.mockResolvedValue(row);
  repo.addTaskComment.mockResolvedValue({ id: EVENT, comment: "Listo" });
});

function expectNoRequestApiInsideAfter() {
  expect(phase.requestApiCalls.filter((call) => call.endsWith("(after)"))).toEqual([]);
}

describe("Tareas mutations: after() callbacks with cookies()/headers() throwing", () => {
  it("createUserTaskAction notifies the manager with the trace id read before after()", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await createUserTaskAction({ projectId: PROJECT, workflowId: WORKFLOW, title: row.title } as never);
    await runAfterCallbacks();
    expectNoRequestApiInsideAfter();
    expect(notifyMock).toHaveBeenCalledWith(
      {},
      [MANAGER],
      expect.objectContaining({ kind: "asignacion", actorId: ACTOR, entityId: TASK }),
    );
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("assignTaskAction notifies the new manager", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await assignTaskAction(TASK, MANAGER);
    await runAfterCallbacks();
    expectNoRequestApiInsideAfter();
    expect(notifyMock).toHaveBeenCalledWith({}, [MANAGER], expect.objectContaining({ kind: "asignacion" }));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("addTaskCommentAction notifies the task manager", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await addTaskCommentAction(TASK, "Listo");
    await runAfterCallbacks();
    expectNoRequestApiInsideAfter();
    expect(notifyMock).toHaveBeenCalledWith(
      {},
      [MANAGER],
      expect.objectContaining({ kind: "comentario", dedupeKey: `comentario:${EVENT}`, actorId: ACTOR }),
    );
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("setTaskStatusAction runs the closing hook with the actor and the request trace id", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await setTaskStatusAction(TASK, "completado");
    await runAfterCallbacks();
    expectNoRequestApiInsideAfter();
    expect(flow.onTaskClosingChanged).toHaveBeenCalledWith({}, PROJECT, WORKFLOW, ACTOR);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("updateTaskAction with a status change runs the closing hook the same way", async () => {
    await updateTaskAction(TASK, { status: "completado" });
    await runAfterCallbacks();
    expectNoRequestApiInsideAfter();
    expect(flow.onTaskClosingChanged).toHaveBeenCalledWith({}, PROJECT, WORKFLOW, ACTOR);
  });

  it("reads the trace id during the request, never inside after()", async () => {
    await createUserTaskAction({ projectId: PROJECT, workflowId: WORKFLOW, title: row.title } as never);
    expect(phase.requestApiCalls).toEqual(["headers"]);
    await runAfterCallbacks();
    expect(phase.requestApiCalls).toEqual(["headers"]);
  });
});
