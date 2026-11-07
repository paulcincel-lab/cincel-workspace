import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  redesignEnabled: true,
  canViewActivities: true,
  tasks: [] as Array<{ commitmentDate: string | null; status: string; customStatus: { id: string; name: string; closes: boolean; countsAsCompleted: boolean } | null }>,
  fail: false,
}));

vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: async () => ({ redesignEnabled: state.redesignEnabled }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: async () => ({ member: { id: "s1" }, access: "Colaborador" }),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canViewActivities: state.canViewActivities }),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchMyTasksAction: async () => {
    if (state.fail) throw new Error("db down");
    return state.tasks;
  },
}));

import { countOverdueTasks, tareasNavItem } from "./tareas";

const SESSION = { staffId: "s1", name: "Ana", role: "Colaborador", isAdmin: false, photoUrl: null };

function iso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

beforeEach(() => {
  state.redesignEnabled = true;
  state.canViewActivities = true;
  state.tasks = [];
  state.fail = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("countOverdueTasks", () => {
  it("counts open tasks with a fecha compromiso before today", () => {
    const tasks = [
      { commitmentDate: "2026-11-05", status: "pendiente" as const, customStatus: null },
      { commitmentDate: "2026-11-06", status: "en_proceso" as const, customStatus: null },
      { commitmentDate: "2026-11-01", status: "completado" as const, customStatus: null },
      { commitmentDate: "2026-11-01", status: "en_proceso" as const, customStatus: { id: "cs1", name: "Cerrada", closes: true, countsAsCompleted: true } },
      { commitmentDate: null, status: "pendiente" as const, customStatus: null },
    ];
    expect(countOverdueTasks(tasks, "2026-11-06")).toBe(1);
  });
});

describe("tareasNavItem", () => {
  it("is the third item of the main section", () => {
    expect(tareasNavItem.key).toBe("tareas");
    expect(tareasNavItem.section).toBe("items");
    expect(tareasNavItem.order).toBe(30);
  });

  it("shows my overdue tasks as the badge", async () => {
    state.tasks = [
      { commitmentDate: iso(-2), status: "pendiente", customStatus: null },
      { commitmentDate: iso(-1), status: "en_proceso", customStatus: null },
      { commitmentDate: iso(3), status: "pendiente", customStatus: null },
    ];
    const item = await tareasNavItem.resolve(SESSION);
    expect(item).toMatchObject({ key: "tareas", label: "Tareas", href: "/tareas", badge: 2 });
  });

  it("has no badge with nothing overdue", async () => {
    const item = await tareasNavItem.resolve(SESSION);
    expect(item).not.toBeNull();
    expect(item?.badge).toBeUndefined();
  });

  it("is absent with the redesign flag off", async () => {
    state.redesignEnabled = false;
    expect(await tareasNavItem.resolve(SESSION)).toBeNull();
  });

  it("is absent without the activities view capability", async () => {
    state.canViewActivities = false;
    expect(await tareasNavItem.resolve(SESSION)).toBeNull();
  });

  it("keeps the item without a badge when the read fails", async () => {
    state.fail = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const item = await tareasNavItem.resolve(SESSION);
    expect(item).toMatchObject({ key: "tareas", href: "/tareas" });
    expect(item?.badge).toBeUndefined();
  });
});
