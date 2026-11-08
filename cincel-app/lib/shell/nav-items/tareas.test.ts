import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  canViewActivities: true,
  fetchMyTasksAction: vi.fn(),
  listTasks: vi.fn(),
  listMyTasks: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => ({ member: { id: "s1" }, access: "Colaborador" }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canViewActivities: state.canViewActivities }),
}));
// The badge moved to `qk.shell.badges()`: the nav item must read no task.
vi.mock("@/lib/actions/tasks-actions", () => ({ fetchMyTasksAction: state.fetchMyTasksAction }));
vi.mock("@/lib/repositories/tasks-repository", () => ({ listTasks: state.listTasks, listMyTasks: state.listMyTasks }));

import { tareasNavItem } from "./tareas";

const SESSION = { staffId: "s1", name: "Ana", role: "Colaborador", isAdmin: false, photoUrl: null };

beforeEach(() => {
  state.canViewActivities = true;
  vi.clearAllMocks();
});

describe("tareasNavItem", () => {
  it("is the third item of the main section", () => {
    expect(tareasNavItem.key).toBe("tareas");
    expect(tareasNavItem.section).toBe("items");
    expect(tareasNavItem.order).toBe(30);
  });

  it("returns the item with no badge and reads no task (the badge is qk.shell.badges())", async () => {
    const item = await tareasNavItem.resolve(SESSION);
    expect(item).toMatchObject({ key: "tareas", label: "Tareas", href: "/tareas" });
    expect(item?.badge).toBeUndefined();
    expect(state.fetchMyTasksAction).not.toHaveBeenCalled();
    expect(state.listTasks).not.toHaveBeenCalled();
    expect(state.listMyTasks).not.toHaveBeenCalled();
  });

  it("is absent without the activities view capability", async () => {
    state.canViewActivities = false;
    expect(await tareasNavItem.resolve(SESSION)).toBeNull();
  });
});
