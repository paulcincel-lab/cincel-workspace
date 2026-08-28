/**
 * #8 – Authorization at the data layer
 *
 * Phase 2: repository writes go through Server Actions backed by Drizzle +
 * `requireCapabilityUser()` (session + resolved role) instead of Supabase RLS.
 * This verifies the same invariant in the new shape: when the caller lacks the
 * capability the write throws — it does not silently fall back to localStorage,
 * which would mask the access-control failure.
 *
 * We exercise saveActivities because it covers the most sensitive write path
 * (task edits); saveProjects / saveTeamMembers / saveClients follow the same
 * requireCapabilityUser + resolve<Module>Capabilities pattern.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The session adapter rejects for an insufficiently-privileged / absent caller.
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => {
    throw new Error("FORBIDDEN");
  }),
}));

// next/cache is not available outside a request scope.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { saveActivities } from "@/lib/repositories/activities-repository";
import { presaleTasks } from "@/lib/data/presale";

describe("repository-authz — writes reject instead of falling back", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saveActivities throws when the caller lacks the capability", async () => {
    await expect(saveActivities("Presale", presaleTasks)).rejects.toThrow();
  });

  it("saveActivities does NOT persist to localStorage on an auth failure", async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");

    await expect(saveActivities("Presale", presaleTasks)).rejects.toThrow();

    expect(localStorageSpy).not.toHaveBeenCalled();
  });
});
