/**
 * #8 – Authorization at the data layer
 *
 * Repository writes take an explicit actor and no capability check — that
 * check is the Server Action's job (`requireCapabilityUser()` + resolve
 * `<Module>Capabilities()`), exercised here on the tasks action.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => {
    throw new Error("FORBIDDEN");
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createUserTaskAction } from "@/lib/actions/tasks-actions";

describe("actions — writes reject instead of falling back", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createUserTaskAction throws when the caller lacks a session", async () => {
    await expect(
      createUserTaskAction({ projectId: "00000000-0000-0000-0000-000000000001", title: "Test" })
    ).rejects.toThrow();
  });

  it("createUserTaskAction does NOT persist to localStorage on an auth failure", async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");

    await expect(
      createUserTaskAction({ projectId: "00000000-0000-0000-0000-000000000001", title: "Test" })
    ).rejects.toThrow();

    expect(localStorageSpy).not.toHaveBeenCalled();
  });
});
