import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskListItem } from "@/lib/types/core";

/**
 * `fetchMyOpenTasksAction` (Mi espacio): the caller's own tasks from the
 * session, without closed ones, by commitment date then title.
 */

const ACTOR = "33333333-3333-4333-8333-333333333333";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, email: "a@cincel.mx", access: "Colaborador" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const repo = vi.hoisted(() => ({ listMyTasks: vi.fn() }));
vi.mock("@/lib/repositories/tasks-repository", () => repo);
vi.mock("@/lib/repositories/task-dependencies-repository", () => ({}));
vi.mock("@/lib/tasks/closing-hook", () => ({ scheduleTaskClosingHook: vi.fn() }));
vi.mock("@/lib/tasks/task-notifications", () => ({
  notifyTaskAssigned: vi.fn(),
  notifyTaskCommented: vi.fn(),
  notifyTraceId: vi.fn(async () => "t"),
}));
vi.mock("@/lib/cache/screens/inicio", () => ({ revalidateInicioScreen: vi.fn() }));

import { fetchMyOpenTasksAction } from "./tasks-actions";

function task(id: string, patch: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id,
    title: id,
    status: "pendiente",
    customStatus: null,
    commitmentDate: null,
    ...patch,
  } as TaskListItem;
}

beforeEach(() => {
  repo.listMyTasks.mockReset();
});

describe("fetchMyOpenTasksAction", () => {
  it("fetchMyOpenTasksAction drops completado and closing custom statuses", async () => {
    repo.listMyTasks.mockResolvedValue([
      task("abierta"),
      task("hecha", { status: "completado" }),
      task("cerrada", { customStatus: { id: "s1", name: "Entregada", closes: true, countsAsCompleted: true } }),
      task("revision", { customStatus: { id: "s2", name: "En revisión", closes: false, countsAsCompleted: false } }),
    ]);

    const rows = await fetchMyOpenTasksAction();

    expect(rows.map((t) => t.id).sort()).toEqual(["abierta", "revision"]);
    expect(repo.listMyTasks).toHaveBeenCalledWith(ACTOR, {}, expect.objectContaining({ isAdmin: false }));
  });

  it("sorts by commitment date with undated last, then by title", async () => {
    repo.listMyTasks.mockResolvedValue([
      task("Zeta"),
      task("Beta", { commitmentDate: "2026-11-12" }),
      task("Alfa", { commitmentDate: "2026-11-12" }),
      task("Primera", { commitmentDate: "2026-11-06" }),
      task("Ancla"),
    ]);

    const rows = await fetchMyOpenTasksAction();

    expect(rows.map((t) => t.id)).toEqual(["Primera", "Alfa", "Beta", "Ancla", "Zeta"]);
  });
});
