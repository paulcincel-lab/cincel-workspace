import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskRef } from "@/lib/types/core";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const TASK = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const PROJECT = "66666666-6666-4666-8666-666666666666";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: ACTOR },
    access: "Colaborador",
  })),
}));

const caps = vi.hoisted(() => ({
  canCreateActivity: true,
  canViewActivities: true,
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ ...caps }),
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

vi.mock("@/lib/repositories/tasks-repository", () => ({}));

const repo = vi.hoisted(() => ({
  addTaskDependency: vi.fn(),
  removeTaskDependency: vi.fn(),
  listTaskDependencies: vi.fn(),
  getTaskProjectId: vi.fn(),
}));
vi.mock("@/lib/repositories/task-dependencies-repository", () => repo);

import {
  addTaskDependencyAction,
  listTaskDependenciesAction,
  removeTaskDependencyAction,
} from "./tasks-actions";

const ref: TaskRef = {
  id: OTHER,
  title: "Planos",
  status: "pendiente",
  managerName: "Ana",
  commitmentDate: "2026-11-02",
};

beforeEach(() => {
  vi.clearAllMocks();
  caps.canCreateActivity = true;
  caps.canViewActivities = true;
  repo.getTaskProjectId.mockResolvedValue(PROJECT);
  repo.listTaskDependencies.mockResolvedValue({ dependsOn: [ref], blocks: [] });
});

describe("addTaskDependencyAction", () => {
  it("adds the dependency and revalidates the project", async () => {
    await expect(addTaskDependencyAction(TASK, OTHER)).resolves.toBeUndefined();
    expect(repo.addTaskDependency).toHaveBeenCalledWith(TASK, OTHER);
    expect(revalidatePath).toHaveBeenCalledWith(`/proyectos/${PROJECT}/ficha`);
  });

  it("is FORBIDDEN for whoever can't edit the task", async () => {
    caps.canCreateActivity = false;
    await expect(addTaskDependencyAction(TASK, OTHER)).rejects.toThrow(
      /^FORBIDDEN/,
    );
    expect(repo.addTaskDependency).not.toHaveBeenCalled();
  });

  it.each(["NOT_FOUND", "OTHER_PROJECT", "SELF", "DUPLICATE", "CYCLE"])(
    "passes the %s error through",
    async (code) => {
      repo.addTaskDependency.mockRejectedValueOnce(new Error(`${code}: x`));
      await expect(addTaskDependencyAction(TASK, OTHER)).rejects.toThrow(
        new RegExp(`^${code}`),
      );
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});

describe("removeTaskDependencyAction", () => {
  it("removes the dependency", async () => {
    await expect(
      removeTaskDependencyAction(TASK, OTHER),
    ).resolves.toBeUndefined();
    expect(repo.removeTaskDependency).toHaveBeenCalledWith(TASK, OTHER);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("is FORBIDDEN for whoever can't edit the task", async () => {
    caps.canCreateActivity = false;
    await expect(removeTaskDependencyAction(TASK, OTHER)).rejects.toThrow(
      /^FORBIDDEN/,
    );
    expect(repo.removeTaskDependency).not.toHaveBeenCalled();
  });

  it("passes NOT_FOUND through", async () => {
    repo.removeTaskDependency.mockRejectedValueOnce(
      new Error("NOT_FOUND: dependency"),
    );
    await expect(removeTaskDependencyAction(TASK, OTHER)).rejects.toThrow(
      /^NOT_FOUND/,
    );
  });
});

describe("listTaskDependenciesAction", () => {
  it("returns dependsOn and blocks as TaskRef[]", async () => {
    await expect(listTaskDependenciesAction(TASK)).resolves.toEqual({
      dependsOn: [ref],
      blocks: [],
    });
    expect(repo.listTaskDependencies).toHaveBeenCalledWith(TASK);
  });

  it("returns empty lists without activities view access", async () => {
    caps.canViewActivities = false;
    await expect(listTaskDependenciesAction(TASK)).resolves.toEqual({
      dependsOn: [],
      blocks: [],
    });
    expect(repo.listTaskDependencies).not.toHaveBeenCalled();
  });
});
