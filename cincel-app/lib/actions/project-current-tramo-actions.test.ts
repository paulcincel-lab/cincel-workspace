import { unwrapActions } from "@/tests/helpers/action-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** setProjectCurrentTramoAction and createProjectAction (project flow BE §7.3, §9.4). */

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "55555555-5555-4555-8555-555555555555";
const TRAMO = "66666666-6666-4666-8666-666666666666";

const session = vi.hoisted(() => ({ access: "Administrador" as string }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, access: session.access })),
}));

const caps = vi.hoisted(() => ({ canChangeProjectStage: true, canCreateProject: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => caps,
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/google/project-folders-app", () => ({
  syncProjectFolders: vi.fn(),
  syncProjectFolderName: vi.fn(),
  retryProjectFolders: vi.fn(),
}));

const repo = vi.hoisted(() => ({
  createProject: vi.fn(),
  setProjectCurrentTramo: vi.fn(),
  assignProjectTramo: vi.fn(),
}));
vi.mock("@/lib/repositories/projects-repository", () => repo);

import * as projectsActionsModule from "./projects-actions";
const { createProjectAction, setProjectCurrentTramoAction } = unwrapActions(projectsActionsModule);

const DETAIL = { id: PROJECT, name: "Casa Valle", currentWorkflowId: TRAMO };

beforeEach(() => {
  vi.clearAllMocks();
  session.access = "Administrador";
  caps.canChangeProjectStage = true;
  caps.canCreateProject = true;
  repo.setProjectCurrentTramo.mockResolvedValue(DETAIL);
  repo.assignProjectTramo.mockResolvedValue(DETAIL);
  repo.createProject.mockResolvedValue(DETAIL);
});

describe("setProjectCurrentTramoAction", () => {
  it("is FORBIDDEN without canChangeProjectStage", async () => {
    caps.canChangeProjectStage = false;
    await expect(setProjectCurrentTramoAction(PROJECT, TRAMO)).rejects.toThrow("FORBIDDEN");
    expect(repo.setProjectCurrentTramo).not.toHaveBeenCalled();
  });

  it("is NOT_FOUND for malformed ids", async () => {
    await expect(setProjectCurrentTramoAction("nope", TRAMO)).rejects.toThrow("NOT_FOUND");
    await expect(setProjectCurrentTramoAction(PROJECT, "nope")).rejects.toThrow("NOT_FOUND");
  });

  it("sets a started etapa as current, with no project flow route revalidated", async () => {
    const row = await setProjectCurrentTramoAction(PROJECT, TRAMO);
    expect(row).toBe(DETAIL);
    expect(repo.setProjectCurrentTramo).toHaveBeenCalledWith(PROJECT, TRAMO, ACTOR);
    expect(repo.assignProjectTramo).not.toHaveBeenCalled();
    // `/proyectos` reads `qk.proyectos.list()` (5a, #959).
    expect(revalidatePath).not.toHaveBeenCalledWith("/proyectos");
    // The ficha reads its own query (5b, #960): it is not revalidated.
    expect(revalidatePath).not.toHaveBeenCalledWith(`/proyectos/${PROJECT}/ficha`);
    // Tareas reads `qk.tareas.*` (Phase 4) and Inicio `qk.inicio()` (#937): their stubs are not revalidated.
    expect(revalidatePath).not.toHaveBeenCalledWith("/actividades", "layout");
    expect(revalidatePath).not.toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).not.toHaveBeenCalledWith("/tablero");
  });

  it("returns NOT_STARTED for a non-admin on a etapa that wasn't started", async () => {
    session.access = "Colaborador";
    repo.setProjectCurrentTramo.mockRejectedValue(new Error("NOT_STARTED"));
    await expect(setProjectCurrentTramoAction(PROJECT, TRAMO)).rejects.toThrow("NOT_STARTED");
    expect(repo.assignProjectTramo).not.toHaveBeenCalled();
  });

  it("lets an admin assign a etapa that wasn't started (Asignar etapa)", async () => {
    repo.setProjectCurrentTramo.mockRejectedValue(new Error("NOT_STARTED"));
    const row = await setProjectCurrentTramoAction(PROJECT, TRAMO);
    expect(row).toBe(DETAIL);
    expect(repo.assignProjectTramo).toHaveBeenCalledWith(PROJECT, TRAMO, ACTOR);
  });

  it("passes the admin path's NOT_STARTED through when the project already has a current etapa", async () => {
    repo.setProjectCurrentTramo.mockRejectedValue(new Error("NOT_STARTED"));
    repo.assignProjectTramo.mockRejectedValue(new Error("NOT_STARTED"));
    await expect(setProjectCurrentTramoAction(PROJECT, TRAMO)).rejects.toThrow("NOT_STARTED");
  });

  it("doesn't fall back to the admin path on other errors", async () => {
    repo.setProjectCurrentTramo.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(setProjectCurrentTramoAction(PROJECT, TRAMO)).rejects.toThrow("NOT_FOUND");
    expect(repo.assignProjectTramo).not.toHaveBeenCalled();
  });
});

describe("createProjectAction", () => {
  it("is FORBIDDEN without canCreateProject", async () => {
    caps.canCreateProject = false;
    await expect(createProjectAction({ name: "Casa Valle", clientId: null })).rejects.toThrow("FORBIDDEN");
    expect(repo.createProject).not.toHaveBeenCalled();
  });

  it("passes NAME_TAKEN through", async () => {
    repo.createProject.mockRejectedValue(new Error("NAME_TAKEN"));
    await expect(createProjectAction({ name: "Casa Valle", clientId: null })).rejects.toThrow("NAME_TAKEN");
  });

  it("revalidates no Tareas or Inicio stub (they read their own queries)", async () => {
    await createProjectAction({ name: "Casa Valle", clientId: null });
    // Tareas reads `qk.tareas.*` (Phase 4) and Inicio `qk.inicio()` (#937): their stubs are not revalidated.
    expect(revalidatePath).not.toHaveBeenCalledWith("/actividades", "layout");
    expect(revalidatePath).not.toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).not.toHaveBeenCalledWith("/tablero");
  });
});
