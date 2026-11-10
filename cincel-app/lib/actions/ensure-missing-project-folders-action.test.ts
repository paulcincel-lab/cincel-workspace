import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionAccess = vi.hoisted(() => ({
  value: { status: "active", user: { id: "admin", access: "Administrador" } } as {
    status: string;
    user: { id: string; access: string } | null;
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSessionAccess: vi.fn(async () => sessionAccess.value) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/access-recheck", () => ({ recheckStaffAccess: vi.fn() }));
vi.mock("@/lib/auth/directory-error-log", () => ({ recordDirectoryError: vi.fn() }));
vi.mock("@/lib/auth/google-health", () => ({ loadGoogleHealth: vi.fn() }));
vi.mock("@/lib/repositories/workspace-group-mappings-repository", () => ({}));

const folders = vi.hoisted(() => ({ ensureMissingProjectFolders: vi.fn() }));
vi.mock("@/lib/google/project-folders-app", () => folders);

import { ensureMissingProjectFoldersAction } from "./workspace-access-actions";

beforeEach(() => {
  vi.clearAllMocks();
  sessionAccess.value = { status: "active", user: { id: "admin", access: "Administrador" } };
});

describe("ensureMissingProjectFoldersAction", () => {
  it("runs the backfill for an Administrador and returns its counts", async () => {
    folders.ensureMissingProjectFolders.mockResolvedValue({ created: 3, failed: 1, skipped: 2 });
    expect(await ensureMissingProjectFoldersAction()).toEqual({ ok: true, data: { created: 3, failed: 1, skipped: 2 } });
    expect(folders.ensureMissingProjectFolders).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["another role", { status: "active", user: { id: "u", access: "Dirección" } }],
    ["a revoked session", { status: "revoked", user: { id: "admin", access: "Administrador" } }],
    ["no session", { status: "anonymous", user: null }],
  ])("refuses %s", async (_label, access) => {
    sessionAccess.value = access;
    expect(await ensureMissingProjectFoldersAction()).toEqual({
      ok: false,
      error: "FORBIDDEN: ensure project folders",
    });
    expect(folders.ensureMissingProjectFolders).not.toHaveBeenCalled();
  });
});
