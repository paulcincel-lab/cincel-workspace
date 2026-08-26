/**
 * #8 – Authorization at the data layer
 *
 * Verifies that repository write functions propagate a real error (not a
 * silent localStorage fallback) when Supabase returns a permission-denied
 * response. This mirrors what happens server-side when RLS rejects a write
 * from an insufficiently-privileged user and Supabase returns a Postgres
 * permission-denied error.
 *
 * We exercise saveActivities because it covers the most sensitive write path
 * (task edits). The same SupabaseOperationError propagation pattern is used
 * by every other repository write (saveProjects, etc.).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SupabaseOperationError } from "@/lib/supabase/errors";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Pretend Supabase is enabled so saveActivities uses the client path.
vi.mock("@/lib/supabase/data-source", () => ({
  isSupabaseEnabled: () => true,
  getDataSource: () => "supabase" as const,
}));

// Simulate a Supabase client whose upsert returns a permission-denied error.
const mockUpsert = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    schema: () => ({
      from: () => ({
        upsert: mockUpsert,
      }),
    }),
  }),
}));

import { saveActivities } from "@/lib/repositories/activities-repository";
import { presaleTasks } from "@/lib/data/presale";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("repository-authz — write operations propagate RLS errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saveActivities throws SupabaseOperationError when Supabase returns permission denied", async () => {
    mockUpsert.mockResolvedValue({
      error: { message: "permission denied for table activities" },
      data: null,
    });

    await expect(saveActivities("Presale", presaleTasks)).rejects.toBeInstanceOf(
      SupabaseOperationError
    );
  });

  it("SupabaseOperationError message includes the Supabase error detail", async () => {
    const pgError = "new row violates row-level security policy for table \"activities\"";
    mockUpsert.mockResolvedValue({ error: { message: pgError }, data: null });

    let caught: SupabaseOperationError | null = null;
    try {
      await saveActivities("Presale", presaleTasks);
    } catch (err) {
      if (err instanceof SupabaseOperationError) caught = err;
    }

    expect(caught).not.toBeNull();
    expect(caught?.supabaseMessage).toBe(pgError);
    expect(caught?.operation).toContain("saveActivities");
  });

  it("saveActivities does NOT fall back to localStorage on a permission error", async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    mockUpsert.mockResolvedValue({
      error: { message: "permission denied" },
      data: null,
    });

    await expect(saveActivities("Presale", presaleTasks)).rejects.toBeInstanceOf(
      SupabaseOperationError
    );

    // The repository must not silently persist to localStorage when the
    // write fails — that would mask the access-control failure.
    expect(localStorageSpy).not.toHaveBeenCalled();
  });
});
