import { unwrapActions } from "@/tests/helpers/action-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** setProjectCurrentEtapaAction and createProjectAction (project flow BE §7.3, §9.4). */

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "55555555-5555-4555-8555-555555555555";
const ETAPA = "66666666-6666-4666-8666-666666666666";

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
  setProjectCurrentEtapa: vi.fn(),
  assignProjectEtapa: vi.fn(),
}));
vi.mock("@/lib/repositories/projects-repository", () => repo);

import * as projectsActionsModule from "./projects-actions";
const { createProjectAction, setProjectCurrentEtapaAction } = unwrapActions(projectsActionsModule);

const DETAIL = { id: PROJECT, name: "Casa Valle", currentWorkflowId: ETAPA };

beforeEach(() => {
  vi.clearAllMocks();
  session.access = "Administrador";
  caps.canChangeProjectStage = true;
  caps.canCreateProject = true;
  repo.setProjectCurrentEtapa.mockResolvedValue(DETAIL);
  repo.assignProjectEtapa.mockResolvedValue(DETAIL);
  repo.createProject.mockResolvedValue(DETAIL);
});

describe("setProjectCurrentEtapaAction", () => {
  it("is FORBIDDEN without canChangeProjectStage", async () => {
    caps.canChangeProjectStage = false;
    await expect(setProjectCurrentEtapaAction(PROJECT, ETAPA)).rejects.toThrow("FORBIDDEN");
    expect(repo.setProjectCurrentEtapa).not.toHaveBeenCalled();
  });

  it("is NOT_FOUND for malformed ids", async () => {
    await expect(setProjectCurrentEtapaAction("nope", ETAPA)).rejects.toThrow("NOT_FOUND");
    await expect(setProjectCurrentEtapaAction(PROJECT, "nope")).rejects.toThrow("NOT_FOUND");
  });

  it("sets a started etapa as current, with no project flow route revalidated", async () => {
    const row = await setProjectCurrentEtapaAction(PROJECT, ETAPA);
    expect(row).toBe(DETAIL);
    expect(repo.setProjectCurrentEtapa).toHaveBeenCalledWith(PROJECT, ETAPA, ACTOR);
    expect(repo.assignProjectEtapa).not.toHaveBeenCalled();
    // `/proyectos` reads `qk.proyectos.list()` (5a, #959).
    expect(revalidatePath).not.toHaveBeenCalledWith("/proyectos");
    // The ficha reads its own query (5b, #960): it is not revalidated.
    expect(revalidatePath).not.toHaveBeenCalledWith(`/proyectos/${PROJECT}/ficha`);
    // Tareas reads `qk.tareas.*` (Phase 4) and Inicio `qk.inicio()` (#937): their stubs are not revalidated.
    expect(revalidatePath).not.toHaveBeenCalledWith("/actividades", "layout");
    expect(revalidatePath).not.toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).not.toHaveBeenCalledWith("/tablero");
  });

  it("returns NOT_STARTED for a non-admin on an etapa that wasn't started", async () => {
    session.access = "Colaborador";
    repo.setProjectCurrentEtapa.mockRejectedValue(new Error("NOT_STARTED"));
    await expect(setProjectCurrentEtapaAction(PROJECT, ETAPA)).rejects.toThrow("NOT_STARTED");
    expect(repo.assignProjectEtapa).not.toHaveBeenCalled();
  });

  it("lets an admin assign an etapa that wasn't started (Asignar etapa)", async () => {
    repo.setProjectCurrentEtapa.mockRejectedValue(new Error("NOT_STARTED"));
    const row = await setProjectCurrentEtapaAction(PROJECT, ETAPA);
    expect(row).toBe(DETAIL);
    expect(repo.assignProjectEtapa).toHaveBeenCalledWith(PROJECT, ETAPA, ACTOR);
  });

  it("passes the admin path's NOT_STARTED through when the project already has a current etapa", async () => {
    repo.setProjectCurrentEtapa.mockRejectedValue(new Error("NOT_STARTED"));
    repo.assignProjectEtapa.mockRejectedValue(new Error("NOT_STARTED"));
    await expect(setProjectCurrentEtapaAction(PROJECT, ETAPA)).rejects.toThrow("NOT_STARTED");
  });

  it("doesn't fall back to the admin path on other errors", async () => {
    repo.setProjectCurrentEtapa.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(setProjectCurrentEtapaAction(PROJECT, ETAPA)).rejects.toThrow("NOT_FOUND");
    expect(repo.assignProjectEtapa).not.toHaveBeenCalled();
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
