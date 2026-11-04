import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "55555555-5555-4555-8555-555555555555";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, access: "Administrador" })),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => ({ canCreateProject: true, canEditProjectGeneral: true }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

const folders = vi.hoisted(() => ({ syncProjectFolders: vi.fn(), syncProjectFolderName: vi.fn() }));
vi.mock("@/lib/google/project-folders-app", () => folders);

const repo = vi.hoisted(() => ({ createProject: vi.fn(), updateProject: vi.fn() }));
vi.mock("@/lib/repositories/projects-repository", () => repo);

import { createProjectAction, updateProjectAction } from "./projects-actions";

async function runAfter() {
  for (const cb of afterCallbacks.splice(0)) await cb();
}

beforeEach(() => {
  afterCallbacks.length = 0;
  vi.clearAllMocks();
  repo.createProject.mockResolvedValue({ id: PROJECT, name: "Casa Valle" });
  repo.updateProject.mockResolvedValue({ id: PROJECT, name: "Casa Valle" });
});

describe("createProjectAction", () => {
  it("returns the project at once and creates its Drive folders after the response", async () => {
    const row = await createProjectAction({ name: "Casa Valle" } as never);
    expect(row.id).toBe(PROJECT);
    expect(folders.syncProjectFolders).not.toHaveBeenCalled();

    await runAfter();
    expect(folders.syncProjectFolders).toHaveBeenCalledWith(PROJECT);
  });

  it("still returns the project when the folder sync fails", async () => {
    folders.syncProjectFolders.mockResolvedValue({ status: "failed", error: "Drive caído" });
    const row = await createProjectAction({ name: "Casa Valle" } as never);
    await runAfter();
    expect(row.id).toBe(PROJECT);
  });
});

describe("updateProjectAction", () => {
  it("renames the folder after a name change", async () => {
    await updateProjectAction(PROJECT, { name: "Casa Valle Alto" });
    await runAfter();
    expect(folders.syncProjectFolderName).toHaveBeenCalledWith(PROJECT);
  });

  it("renames the folder after a code change", async () => {
    await updateProjectAction(PROJECT, { code: "P-09" });
    await runAfter();
    expect(folders.syncProjectFolderName).toHaveBeenCalledWith(PROJECT);
  });

  it("leaves Drive alone for other edits", async () => {
    await updateProjectAction(PROJECT, { progress: 40 });
    await runAfter();
    expect(afterCallbacks).toHaveLength(0);
    expect(folders.syncProjectFolderName).not.toHaveBeenCalled();
  });
});
