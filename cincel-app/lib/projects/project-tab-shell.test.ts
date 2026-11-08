// @vitest-environment node
/**
 * Project tab shell (#954): `loadProjectShell` reads COUNTs only and never
 * calls Drive; `loadProjectTabShell` keeps the Drive count for the
 * server-rendered tabs when the caller didn't pass `archivos`; the
 * capabilities gate each count.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "22222222-2222-4222-8222-222222222222";

const caps = vi.hoisted(() => ({ canViewProjects: true, canViewActivities: true, manageAccess: true, isAdmin: false }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: caps.canViewProjects }),
  resolveActivitiesCapabilities: () => ({ canViewActivities: caps.canViewActivities }),
  resolvePortalCapabilities: () => ({ manageAccess: caps.manageAccess }),
  canSeeAdminData: () => caps.isAdmin,
}));

const repos = vi.hoisted(() => ({
  getProject: vi.fn(),
  countProjectTasks: vi.fn(async () => 3),
  countProjectPortalAccess: vi.fn(async () => 2),
  rootFiles: vi.fn(async () => 7),
}));
vi.mock("@/lib/repositories/projects-repository", () => ({ getProject: repos.getProject }));
vi.mock("@/lib/repositories/tasks-repository", () => ({ countProjectTasks: repos.countProjectTasks }));
vi.mock("@/lib/repositories/portal-access-repository", () => ({
  countProjectPortalAccess: repos.countProjectPortalAccess,
}));
vi.mock("@/lib/projects/project-root-files-count", () => ({ projectRootFilesCount: repos.rootFiles }));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

import { loadProjectShell, loadProjectTabShell } from "./project-tab-shell";

const user = { member: { id: "viewer" }, email: "", access: "Colaborador" } as unknown as AuthenticatedUser;

const detail = {
  id: PROJECT,
  name: "Casa Lomas",
  currentWorkflow: null,
  projectType: null,
  addressCity: "CDMX",
  manager: null,
};

beforeEach(() => {
  Object.assign(caps, { canViewProjects: true, canViewActivities: true, manageAccess: true, isAdmin: false });
  vi.clearAllMocks();
  repos.getProject.mockResolvedValue(detail);
});

describe("loadProjectShell", () => {
  it("counts top-level tasks and portal access with COUNTs and makes no Drive call", async () => {
    const shell = await loadProjectShell(PROJECT, user);
    expect(shell?.counts).toEqual({ tareas: 3, clientes: 2, archivos: 0 });
    expect(shell?.canManagePortal).toBe(true);
    expect(shell?.project).toEqual({
      id: PROJECT,
      name: "Casa Lomas",
      tramo: null,
      projectType: null,
      addressCity: "CDMX",
      manager: null,
    });
    expect(repos.getProject).toHaveBeenCalledWith(PROJECT, { staffId: "viewer", isAdmin: false });
    expect(repos.countProjectTasks).toHaveBeenCalledWith(PROJECT, { staffId: "viewer", isAdmin: false }, { topLevel: true });
    expect(repos.countProjectPortalAccess).toHaveBeenCalledWith(PROJECT);
    expect(repos.rootFiles).not.toHaveBeenCalled();
  });

  it("is null without canViewProjects, before reading anything", async () => {
    caps.canViewProjects = false;
    expect(await loadProjectShell(PROJECT, user)).toBeNull();
    expect(repos.getProject).not.toHaveBeenCalled();
    expect(repos.countProjectTasks).not.toHaveBeenCalled();
  });

  it("is null for a missing project or a failing read", async () => {
    repos.getProject.mockResolvedValueOnce(null);
    expect(await loadProjectShell(PROJECT, user)).toBeNull();
    repos.getProject.mockRejectedValueOnce(new Error("invalid input syntax for type uuid"));
    expect(await loadProjectShell("nope", user)).toBeNull();
  });

  it("reads no task count without canViewActivities and no portal count without manageAccess", async () => {
    caps.canViewActivities = false;
    caps.manageAccess = false;
    const shell = await loadProjectShell(PROJECT, user);
    expect(shell?.counts).toEqual({ tareas: 0, clientes: 0, archivos: 0 });
    expect(shell?.canManagePortal).toBe(false);
    expect(repos.countProjectTasks).not.toHaveBeenCalled();
    expect(repos.countProjectPortalAccess).not.toHaveBeenCalled();
  });

  it("uses the counts a caller passes in", async () => {
    const shell = await loadProjectShell(PROJECT, user, { archivos: 4, clientes: 9 });
    expect(shell?.counts).toEqual({ tareas: 3, clientes: 9, archivos: 4 });
    expect(repos.countProjectPortalAccess).not.toHaveBeenCalled();
  });

  it("reads 0 when a count fails", async () => {
    repos.countProjectTasks.mockRejectedValueOnce(new Error("db down"));
    repos.countProjectPortalAccess.mockRejectedValueOnce(new Error("db down"));
    const shell = await loadProjectShell(PROJECT, user);
    expect(shell?.counts).toEqual({ tareas: 0, clientes: 0, archivos: 0 });
  });
});

describe("loadProjectTabShell", () => {
  it("keeps the Drive count for the server-rendered tabs", async () => {
    const shell = await loadProjectTabShell(PROJECT, user);
    expect(shell?.counts.archivos).toBe(7);
    expect(repos.rootFiles).toHaveBeenCalledWith("viewer", PROJECT);
  });

  it("skips Drive when the caller already listed the folder", async () => {
    const shell = await loadProjectTabShell(PROJECT, user, { archivos: 5 });
    expect(shell?.counts.archivos).toBe(5);
    expect(repos.rootFiles).not.toHaveBeenCalled();
  });

  it("skips Drive for a project the viewer can't see", async () => {
    caps.canViewProjects = false;
    expect(await loadProjectTabShell(PROJECT, user)).toBeNull();
    expect(repos.rootFiles).not.toHaveBeenCalled();
  });
});
