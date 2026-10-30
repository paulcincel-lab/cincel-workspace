import { beforeEach, describe, expect, it, vi } from "vitest";

const VIEWER = "viewer";
const DAY = new Date("2026-10-28T18:00:00Z"); // Wed 28 Oct, Mexico City

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: VIEWER },
    access: "Colaborador",
  })),
}));

const dataScope = vi.hoisted(() => ({ value: "global" as string }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveDashboardCapabilities: () => ({ dataScope: dataScope.value }),
}));

const listTaskTrendSource = vi.hoisted(() => vi.fn());
vi.mock("@/lib/repositories/tasks-repository", () => ({ listTaskTrendSource }));

import { fetchDashboardTaskTrendAction } from "./dashboard-actions";

function task(
  id: string,
  projectId: string,
  projectManagerId: string | null,
  managerId: string | null,
  support: string[] = []
) {
  return {
    id,
    createdAt: DAY,
    project: { id: projectId, name: projectId, managerId: projectManagerId },
    manager: managerId ? { id: managerId } : null,
    support: support.map((s) => ({ id: s, name: s })),
  };
}

describe("fetchDashboardTaskTrendAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T18:00:00Z"));
    listTaskTrendSource.mockResolvedValue({
      tasks: [
        task("mine", "p-other", "someone", VIEWER),
        task("support", "p-other", "someone", "someone", [VIEWER]),
        task("managed", "p-mine", VIEWER, "someone"),
        task("foreign", "p-other", "someone", "someone"),
      ],
      completions: ["mine", "support", "managed", "foreign"].map((taskId) => ({
        taskId,
        at: DAY,
      })),
    });
  });

  it("global scope counts every task", async () => {
    dataScope.value = "global";
    const result = await fetchDashboardTaskTrendAction("semana");
    expect(result.created[2]).toBe(4);
    expect(result.completed[2]).toBe(4);
  });

  it("managed_projects scope counts only tasks of projects the viewer manages", async () => {
    dataScope.value = "managed_projects";
    const result = await fetchDashboardTaskTrendAction("semana");
    expect(result.created[2]).toBe(1);
    expect(result.completed[2]).toBe(1);
  });

  it("assigned_tasks scope counts only tasks the viewer owns or supports", async () => {
    dataScope.value = "assigned_tasks";
    const result = await fetchDashboardTaskTrendAction("mes");
    expect(result.labels).toEqual(["S40", "S41", "S42", "S43", "S44"]);
    expect(result.created).toEqual([0, 0, 0, 0, 2]);
    expect(result.completed).toEqual([0, 0, 0, 0, 2]);
  });

  it("rejects an unknown range", async () => {
    await expect(fetchDashboardTaskTrendAction("año" as "mes")).rejects.toThrow();
  });
});
