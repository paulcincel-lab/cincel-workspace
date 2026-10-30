import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskRef } from "@/lib/types/core";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PARENT = "55555555-5555-4555-8555-555555555555";
const PROJECT = "44444444-4444-4444-8444-444444444444";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: ACTOR },
    access: "Colaborador",
  })),
}));

const caps = vi.hoisted(() => ({ canCreate: true, canView: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({
    canCreateActivity: caps.canCreate,
    canViewActivities: caps.canView,
  }),
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const repo = vi.hoisted(() => ({
  createSubtask: vi.fn(),
  listSubtasks: vi.fn(),
}));
vi.mock("@/lib/repositories/tasks-repository", () => repo);

import { createSubtaskAction, listSubtasksAction } from "./tasks-actions";

const refs: TaskRef[] = [
  {
    id: "c1",
    title: "Medir muros",
    status: "pendiente",
    managerName: "Ana",
    commitmentDate: "2026-11-03",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  caps.canCreate = true;
  caps.canView = true;
  repo.createSubtask.mockResolvedValue({ id: "c1", projectId: PROJECT });
  repo.listSubtasks.mockResolvedValue(refs);
});

describe("createSubtaskAction", () => {
  it("creates the child through the repository as the session user", async () => {
    const row = await createSubtaskAction(PARENT, { title: "Medir muros" });
    expect(row).toMatchObject({ id: "c1" });
    expect(repo.createSubtask).toHaveBeenCalledWith(
      PARENT,
      { title: "Medir muros" },
      ACTOR,
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/proyectos/${PROJECT}/ficha`);
  });

  it("throws FORBIDDEN without the create-task capability", async () => {
    caps.canCreate = false;
    await expect(createSubtaskAction(PARENT, { title: "x" })).rejects.toThrow(
      "FORBIDDEN",
    );
    expect(repo.createSubtask).not.toHaveBeenCalled();
  });

  it("maps a missing parent to NOT_FOUND", async () => {
    repo.createSubtask.mockRejectedValue(new Error("TASK_NOT_FOUND"));
    await expect(createSubtaskAction(PARENT, { title: "x" })).rejects.toThrow(
      /^NOT_FOUND$/,
    );
  });

  it("maps a parent that is already a subtask to NESTED", async () => {
    repo.createSubtask.mockRejectedValue(new Error("TASK_NESTED"));
    await expect(createSubtaskAction(PARENT, { title: "x" })).rejects.toThrow(
      /^NESTED$/,
    );
  });

  it("passes other errors through", async () => {
    repo.createSubtask.mockRejectedValue(new Error("TASK_TITLE_REQUIRED"));
    await expect(createSubtaskAction(PARENT, { title: " " })).rejects.toThrow(
      "TASK_TITLE_REQUIRED",
    );
  });
});

describe("listSubtasksAction", () => {
  it("returns the children as TaskRef[]", async () => {
    await expect(listSubtasksAction(PARENT)).resolves.toEqual(refs);
    expect(repo.listSubtasks).toHaveBeenCalledWith(PARENT);
  });

  it("returns nothing without view access", async () => {
    caps.canView = false;
    await expect(listSubtasksAction(PARENT)).resolves.toEqual([]);
    expect(repo.listSubtasks).not.toHaveBeenCalled();
  });
});
