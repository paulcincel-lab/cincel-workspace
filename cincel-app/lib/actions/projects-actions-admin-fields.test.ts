import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "55555555-5555-4555-8555-555555555555";
const CLIENT = "66666666-6666-4666-8666-666666666666";

const session = vi.hoisted(() => ({ access: "Administrador" as string }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, access: session.access })),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => ({ canCreateProject: true, canEditProjectGeneral: true, canArchiveProject: true }),
}));

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

const folders = vi.hoisted(() => ({
  syncProjectFolders: vi.fn(),
  syncProjectFolderName: vi.fn(),
  retryProjectFolders: vi.fn(),
}));
vi.mock("@/lib/google/project-folders-app", () => folders);

const repo = vi.hoisted(() => ({ createProject: vi.fn(), updateProject: vi.fn() }));
vi.mock("@/lib/repositories/projects-repository", () => repo);

import { archiveProjectAction, createProjectAction, updateProjectAction } from "./projects-actions";
import type { ProjectCreateInput } from "@/lib/types/core";

async function runAfter() {
  for (const cb of afterCallbacks.splice(0)) await cb();
}

beforeEach(() => {
  afterCallbacks.length = 0;
  vi.clearAllMocks();
  session.access = "Administrador";
  repo.createProject.mockResolvedValue({ id: PROJECT, name: "Casa Valle" });
  repo.updateProject.mockResolvedValue({ id: PROJECT, name: "Casa Valle" });
});

describe("createProjectAction (name only)", () => {
  it("passes only the name to the repository, whatever else the caller sends", async () => {
    await createProjectAction({ name: "Casa Valle", clientId: CLIENT, currentWorkflowId: null } as unknown as ProjectCreateInput);
    expect(repo.createProject).toHaveBeenCalledWith({ name: "Casa Valle" }, ACTOR);
  });

  it("revalidates Proyectos, the ficha, Actividades, Dashboard and Tablero", async () => {
    await createProjectAction({ name: "Casa Valle" });
    const paths = cache.revalidatePath.mock.calls.map((c) => c[0]);
    expect(paths).toEqual(
      expect.arrayContaining(["/proyectos", `/proyectos/${PROJECT}/ficha`, "/actividades", "/dashboard", "/tablero"])
    );
  });

  it("surfaces the repository's NAME_TAKEN", async () => {
    repo.createProject.mockRejectedValue(new Error("NAME_TAKEN"));
    await expect(createProjectAction({ name: "Casa Valle" })).rejects.toThrow("NAME_TAKEN");
  });
});

describe("updateProjectAction admin-only fields", () => {
  it.each([{ clientId: CLIENT }, { origin: "Referido" }, { originStaffId: ACTOR }, { clientId: null }])(
    "refuses %o to a non-admin with FORBIDDEN",
    async (patch) => {
      session.access = "Colaborador";
      await expect(updateProjectAction(PROJECT, patch)).rejects.toThrow(/^FORBIDDEN/);
      expect(repo.updateProject).not.toHaveBeenCalled();
    }
  );

  it("lets a non-admin edit general fields, with a non-admin viewer", async () => {
    session.access = "Colaborador";
    await updateProjectAction(PROJECT, { progress: 40 });
    expect(repo.updateProject).toHaveBeenCalledWith(PROJECT, { progress: 40 }, ACTOR, {
      staffId: ACTOR,
      isAdmin: false,
    });
  });

  it("syncs the project folders after an admin sets the client", async () => {
    await updateProjectAction(PROJECT, { clientId: CLIENT });
    expect(repo.updateProject).toHaveBeenCalledWith(PROJECT, { clientId: CLIENT }, ACTOR, {
      staffId: ACTOR,
      isAdmin: true,
    });
    expect(folders.syncProjectFolders).not.toHaveBeenCalled();
    await runAfter();
    expect(folders.syncProjectFolders).toHaveBeenCalledWith(PROJECT);
  });

  it("doesn't sync folders when the client is cleared", async () => {
    await updateProjectAction(PROJECT, { clientId: null });
    await runAfter();
    expect(folders.syncProjectFolders).not.toHaveBeenCalled();
  });

  it("archives with the viewer scope", async () => {
    session.access = "Colaborador";
    await archiveProjectAction(PROJECT, "completado");
    expect(repo.updateProject).toHaveBeenCalledWith(PROJECT, { status: "completado" }, ACTOR, {
      staffId: ACTOR,
      isAdmin: false,
    });
  });
});
