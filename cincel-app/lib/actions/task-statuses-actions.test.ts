import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = vi.hoisted(() => ({ value: { member: { role: "Administrador" }, access: "Administrador" } }));
vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => currentUser.value) }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const repo = vi.hoisted(() => ({
  listTaskStatuses: vi.fn(),
  createTaskStatus: vi.fn(),
  updateTaskStatus: vi.fn(),
  softDeleteTaskStatus: vi.fn(),
}));
vi.mock("@/lib/repositories/task-statuses-repository", () => repo);

import { unwrapActions } from "@/tests/helpers/action-result";

import * as taskStatusesActionsModule from "./task-statuses-actions";

const { createTaskStatusAction, updateTaskStatusAction } = unwrapActions(taskStatusesActionsModule);

const ADMIN = { member: { role: "Administrador" }, access: "Administrador" };
const COLLABORATOR = { member: { role: "Arquitecto" }, access: "Colaborador" };

beforeEach(() => {
  vi.clearAllMocks();
  currentUser.value = ADMIN;
});

describe("task status actions and countsAsCompleted", () => {
  it("passes countsAsCompleted through on create", async () => {
    const option = { id: "s1", name: "Cancelado", closes: true, countsAsCompleted: false, sortOrder: 0 };
    repo.createTaskStatus.mockResolvedValue(option);

    await expect(
      createTaskStatusAction({ name: "Cancelado", closes: true, countsAsCompleted: false })
    ).resolves.toEqual(option);
    expect(repo.createTaskStatus).toHaveBeenCalledWith({ name: "Cancelado", closes: true, countsAsCompleted: false });
  });

  it("passes countsAsCompleted through on update", async () => {
    const option = { id: "s1", name: "Cancelado", closes: true, countsAsCompleted: true, sortOrder: 0 };
    repo.updateTaskStatus.mockResolvedValue(option);

    await expect(updateTaskStatusAction("s1", { countsAsCompleted: true })).resolves.toEqual(option);
    expect(repo.updateTaskStatus).toHaveBeenCalledWith("s1", { countsAsCompleted: true });
  });

  it("surfaces INVALID from the repository", async () => {
    repo.createTaskStatus.mockRejectedValue(new Error("INVALID: countsAsCompleted"));
    await expect(createTaskStatusAction({ name: "En espera", countsAsCompleted: true })).rejects.toThrow("INVALID");
  });

  it("refuses a collaborator", async () => {
    currentUser.value = COLLABORATOR;
    await expect(updateTaskStatusAction("s1", { countsAsCompleted: true })).rejects.toThrow("FORBIDDEN");
    expect(repo.updateTaskStatus).not.toHaveBeenCalled();
  });
});
