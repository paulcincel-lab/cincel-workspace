import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskStatusInput } from "@/lib/types/core";

const STATUS = "99999999-9999-4999-8999-111111111111";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "33333333-3333-4333-8333-333333333333" },
    access: "Administrador",
  })),
}));

const caps = vi.hoisted(() => ({ canManage: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveTaskStatusesCapabilities: () => ({
    canViewTaskStatuses: true,
    canManageTaskStatuses: caps.canManage,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const existing = vi.hoisted(() => ({ closes: true }));

/** BE §7.6: counting as completed needs a closing status, wherever the check runs. */
function checkCounts(closes: boolean | undefined, counts: boolean | undefined) {
  if (counts === true && closes === false) throw new Error("INVALID: countsAsCompleted");
}

const repo = vi.hoisted(() => ({
  listTaskStatuses: vi.fn(),
  createTaskStatus: vi.fn(),
  updateTaskStatus: vi.fn(),
  softDeleteTaskStatus: vi.fn(),
}));
vi.mock("@/lib/repositories/task-statuses-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/task-statuses-repository")>()),
  ...repo,
}));

import { createTaskStatusAction, updateTaskStatusAction } from "./task-statuses-actions";

beforeEach(() => {
  vi.clearAllMocks();
  caps.canManage = true;
  existing.closes = true;
  repo.createTaskStatus.mockImplementation(async (input: TaskStatusInput) => {
    checkCounts(input.closes ?? false, input.countsAsCompleted);
    return {
      id: STATUS,
      name: input.name,
      closes: input.closes ?? false,
      countsAsCompleted: input.countsAsCompleted ?? false,
    };
  });
  repo.updateTaskStatus.mockImplementation(async (id: string, patch: Partial<TaskStatusInput>) => {
    const closes = patch.closes ?? existing.closes;
    checkCounts(closes, patch.countsAsCompleted);
    return {
      id,
      name: patch.name ?? "Entregado",
      closes,
      countsAsCompleted: closes ? (patch.countsAsCompleted ?? false) : false,
    };
  });
});

describe("createTaskStatusAction", () => {
  it("creates a closing status that counts as completed", async () => {
    await expect(
      createTaskStatusAction({ name: "Entregado", closes: true, countsAsCompleted: true })
    ).resolves.toMatchObject({ closes: true, countsAsCompleted: true });
  });

  it("creates a closing status that doesn't count (Cancelado)", async () => {
    await expect(
      createTaskStatusAction({ name: "Cancelado", closes: true, countsAsCompleted: false })
    ).resolves.toMatchObject({ closes: true, countsAsCompleted: false });
  });

  it("throws INVALID for countsAsCompleted without closes", async () => {
    await expect(
      createTaskStatusAction({ name: "Raro", closes: false, countsAsCompleted: true })
    ).rejects.toThrow(/^INVALID/);
  });

  it("throws FORBIDDEN without canManageTaskStatuses", async () => {
    caps.canManage = false;
    await expect(createTaskStatusAction({ name: "Entregado", closes: true })).rejects.toThrow(/^FORBIDDEN/);
    expect(repo.createTaskStatus).not.toHaveBeenCalled();
  });
});

describe("updateTaskStatusAction", () => {
  it("throws INVALID when turning on countsAsCompleted with closes off", async () => {
    await expect(
      updateTaskStatusAction(STATUS, { closes: false, countsAsCompleted: true })
    ).rejects.toThrow(/^INVALID/);
  });

  it("clears countsAsCompleted when closes is turned off", async () => {
    await expect(updateTaskStatusAction(STATUS, { closes: false })).resolves.toMatchObject({
      closes: false,
      countsAsCompleted: false,
    });
  });

  it("throws FORBIDDEN without canManageTaskStatuses", async () => {
    caps.canManage = false;
    await expect(updateTaskStatusAction(STATUS, { countsAsCompleted: true })).rejects.toThrow(/^FORBIDDEN/);
    expect(repo.updateTaskStatus).not.toHaveBeenCalled();
  });
});
