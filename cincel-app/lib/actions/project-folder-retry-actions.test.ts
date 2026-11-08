import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "55555555-5555-4555-8555-555555555555";

const caps = vi.hoisted(() => ({ canEditProjectGeneral: true }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: "staff-1" }, access: "Arquitecto Senior" })),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => ({ canEditProjectGeneral: caps.canEditProjectGeneral }),
}));

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);
vi.mock("next/server", () => ({ after: vi.fn() }));

const folders = vi.hoisted(() => ({
  retryProjectFolders: vi.fn(),
  syncProjectFolders: vi.fn(),
  syncProjectFolderName: vi.fn(),
}));
vi.mock("@/lib/google/project-folders-app", () => folders);
vi.mock("@/lib/repositories/projects-repository", () => ({}));

import { retryProjectFolderAction } from "./projects-actions";

beforeEach(() => {
  vi.clearAllMocks();
  caps.canEditProjectGeneral = true;
});

describe("retryProjectFolderAction", () => {
  it("is forbidden without canEditProjectGeneral and never reaches Drive", async () => {
    caps.canEditProjectGeneral = false;
    expect(await retryProjectFolderAction(PROJECT)).toEqual({ ok: false, error: "forbidden" });
    expect(folders.retryProjectFolders).not.toHaveBeenCalled();
  });

  it("returns ready once the folders exist, with no revalidation (the caller invalidates its keys)", async () => {
    folders.retryProjectFolders.mockResolvedValue({ status: "ready" });
    expect(await retryProjectFolderAction(PROJECT)).toEqual({ ok: true, status: "ready" });
    expect(folders.retryProjectFolders).toHaveBeenCalledWith(PROJECT);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the Drive error when the retry fails again", async () => {
    folders.retryProjectFolders.mockResolvedValue({ status: "failed", error: "Insufficient permissions" });
    expect(await retryProjectFolderAction(PROJECT)).toEqual({
      ok: true,
      status: "failed",
      error: "Insufficient permissions",
    });
  });

  it("is not_found for an unknown project or a malformed id", async () => {
    folders.retryProjectFolders.mockResolvedValue({ status: "not_found" });
    expect(await retryProjectFolderAction(PROJECT)).toEqual({ ok: false, error: "not_found" });
    expect(await retryProjectFolderAction("no-es-un-id")).toEqual({ ok: false, error: "not_found" });
    expect(folders.retryProjectFolders).toHaveBeenCalledTimes(1);
  });
});
