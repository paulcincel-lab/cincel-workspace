// @vitest-environment node
/**
 * Project flow server actions (BE §7.1–§7.4): input validation through
 * `parseInput` and the permission paths. Repositories and domain modules
 * are mocked; their own behaviour is covered by their tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { revalidatePath } from "next/cache";

const caps = vi.hoisted(() => ({
  canManageWorkflows: true,
  canManagePositions: true,
  canViewActivities: true,
  canCreateActivity: true,
  canEditCollaborator: true,
  canViewProjects: true,
  canEditProjectGeneral: true,
  admin: true,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "actor-1", name: "Ana" },
    email: "ana@cincel.example",
    access: caps.admin ? "Administrador" : "Colaborador",
  })),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  canSeeAdminData: () => caps.admin,
  resolveWorkflowsCapabilities: () => ({ canViewWorkflows: true, canManageWorkflows: caps.canManageWorkflows }),
  resolvePositionsCapabilities: () => ({ canViewPositions: true, canManagePositions: caps.canManagePositions }),
  resolveActivitiesCapabilities: () => ({
    canViewActivities: caps.canViewActivities,
    canCreateActivity: caps.canCreateActivity,
  }),
  resolveTeamCapabilities: () => ({ canViewTeam: true, canEditCollaborator: caps.canEditCollaborator }),
  resolveProjectsCapabilities: () => ({
    canViewProjects: caps.canViewProjects,
    canEditProjectGeneral: caps.canEditProjectGeneral,
  }),
}));
vi.mock("@/lib/google/project-folders-app", () => ({
  retryProjectFolders: vi.fn(),
  syncProjectFolderName: vi.fn(),
  syncProjectFolders: vi.fn(),
}));

const tx = vi.hoisted(() => ({ tx: true }));
vi.mock("@/lib/db/client", () => ({
  db: { transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)) },
}));

const flow = vi.hoisted(() => ({
  tramoBoard: vi.fn(),
  previewStartTramo: vi.fn(),
  startTramo: vi.fn(),
  undoStartTramo: vi.fn(),
}));
vi.mock("@/lib/project-flow/readiness", () => ({ tramoBoard: flow.tramoBoard }));
vi.mock("@/lib/project-flow/start-tramo", () => ({
  previewStartTramo: flow.previewStartTramo,
  startTramo: flow.startTramo,
  undoStartTramo: flow.undoStartTramo,
}));

const workflowsRepo = vi.hoisted(() => ({
  listWorkflows: vi.fn(),
  listTramosNav: vi.fn(),
  setWorkflowAutoStart: vi.fn(),
}));
vi.mock("@/lib/repositories/workflows-repository", () => workflowsRepo);

const phasesRepo = vi.hoisted(() => ({ createPhase: vi.fn(), updatePhase: vi.fn(), reorderPhases: vi.fn() }));
vi.mock("@/lib/repositories/workflow-phases-repository", () => phasesRepo);

const positionsRepo = vi.hoisted(() => ({
  listPositions: vi.fn(),
  createPosition: vi.fn(),
  updatePosition: vi.fn(),
  softDeletePosition: vi.fn(),
  setPositionPhases: vi.fn(),
  reorderPositions: vi.fn(),
  setStaffPositions: vi.fn(),
}));
vi.mock("@/lib/repositories/positions-repository", () => positionsRepo);

const staffRepo = vi.hoisted(() => ({
  liveActiveStaffIds: vi.fn(),
  staffExists: vi.fn(),
  listStaffPositionIds: vi.fn(),
  googleManagedStaffIds: vi.fn(),
  hasPositionGroupMappings: vi.fn(),
}));
vi.mock("@/lib/repositories/staff-repository", () => staffRepo);

const spacesRepo = vi.hoisted(() => ({
  listSpaces: vi.fn(),
  createSpace: vi.fn(),
  renameSpace: vi.fn(),
  reorderSpaces: vi.fn(),
  deleteSpace: vi.fn(),
}));
vi.mock("@/lib/repositories/project-spaces-repository", () => spacesRepo);
vi.mock("@/lib/repositories/projects-repository", () => ({}));

import { GOOGLE_MANAGED_REFUSAL } from "@/lib/types/workspace-access";

import {
  createPositionAction,
  deletePositionAction,
  fetchPositionsAction,
  reorderPositionsAction,
  setPositionPhasesAction,
  updatePositionAction,
} from "./positions-actions";
import {
  createProjectSpaceAction,
  deleteProjectSpaceAction,
  fetchProjectSpacesAction,
  renameProjectSpaceAction,
  reorderProjectSpacesAction,
} from "./projects-actions";
import { setStaffPositionsAction } from "./staff-actions";
import {
  fetchTramoBoardAction,
  previewStartTramoAction,
  startTramoAction,
  undoStartTramoAction,
} from "./tramo-start-actions";
import {
  createWorkflowPhaseAction,
  fetchTramosNavAction,
  fetchWorkflowsAction,
  reorderWorkflowPhasesAction,
  setWorkflowAutoStartAction,
  updateWorkflowPhaseAction,
} from "./workflows-actions";

const W = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";
const F1 = "33333333-3333-4333-8333-333333333333";
const F2 = "44444444-4444-4444-8444-444444444444";
const S1 = "55555555-5555-4555-8555-555555555555";
const S2 = "66666666-6666-4666-8666-666666666666";
const B = "77777777-7777-4777-8777-777777777777";

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(caps, {
    canManageWorkflows: true,
    canManagePositions: true,
    canViewActivities: true,
    canCreateActivity: true,
    canEditCollaborator: true,
    canViewProjects: true,
    canEditProjectGeneral: true,
    admin: true,
  });
});

describe("workflows-actions (§7.1)", () => {
  it("passes the inactive flags only to managers", async () => {
    workflowsRepo.listWorkflows.mockResolvedValue([]);
    await fetchWorkflowsAction({ includeInactive: true, includeInactivePhases: true });
    expect(workflowsRepo.listWorkflows).toHaveBeenLastCalledWith({ includeInactive: true, includeInactivePhases: true });
    caps.canManageWorkflows = false;
    await fetchWorkflowsAction({ includeInactive: true });
    expect(workflowsRepo.listWorkflows).toHaveBeenLastCalledWith({});
  });

  it("lists the tramos nav for any staff session", async () => {
    caps.canManageWorkflows = false;
    workflowsRepo.listTramosNav.mockResolvedValue([{ id: W, key: "diseno", name: "Diseño", sortOrder: 1 }]);
    await expect(fetchTramosNavAction()).resolves.toHaveLength(1);
  });

  it("creates a fase with a trimmed name and revalidates tramos, puestos and the layout", async () => {
    phasesRepo.createPhase.mockResolvedValue({ id: F1 });
    await createWorkflowPhaseAction(W, { name: "  Cobro " });
    expect(phasesRepo.createPhase).toHaveBeenCalledWith(W, { name: "Cobro" }, "actor-1");
    expect(revalidatePath).toHaveBeenCalledWith("/configuracion/tramos");
    expect(revalidatePath).toHaveBeenCalledWith("/configuracion/puestos");
    expect(revalidatePath).toHaveBeenCalledWith("/actividades", "layout");
  });

  it("rejects blank, long and malformed fase input", async () => {
    await expect(createWorkflowPhaseAction(W, { name: "   " })).rejects.toThrow("EMPTY");
    await expect(createWorkflowPhaseAction(W, { name: "x".repeat(121) })).rejects.toThrow("INVALID: name");
    await expect(createWorkflowPhaseAction("nope", { name: "Cobro" })).rejects.toThrow("INVALID");
    await expect(updateWorkflowPhaseAction(F1, { name: "" })).rejects.toThrow("EMPTY");
    await expect(reorderWorkflowPhasesAction(W, ["nope"])).rejects.toThrow("INVALID: 0");
    expect(phasesRepo.createPhase).not.toHaveBeenCalled();
    expect(phasesRepo.updatePhase).not.toHaveBeenCalled();
    expect(phasesRepo.reorderPhases).not.toHaveBeenCalled();
  });

  it("lets an update send only `active`", async () => {
    phasesRepo.updatePhase.mockResolvedValue({ id: F1 });
    await updateWorkflowPhaseAction(F1, { active: false });
    expect(phasesRepo.updatePhase).toHaveBeenCalledWith(F1, { active: false }, "actor-1");
  });

  it("rejects fase and auto-start writes without canManageWorkflows", async () => {
    caps.canManageWorkflows = false;
    await expect(createWorkflowPhaseAction(W, { name: "Cobro" })).rejects.toThrow("FORBIDDEN");
    await expect(updateWorkflowPhaseAction(F1, { name: "Cobro" })).rejects.toThrow("FORBIDDEN");
    await expect(reorderWorkflowPhasesAction(W, [F1])).rejects.toThrow("FORBIDDEN");
    await expect(setWorkflowAutoStartAction(W, true)).rejects.toThrow("FORBIDDEN");
    expect(workflowsRepo.setWorkflowAutoStart).not.toHaveBeenCalled();
  });

  it("stores the auto-start switch and revalidates /proyectos", async () => {
    workflowsRepo.setWorkflowAutoStart.mockResolvedValue({ id: W, autoStart: "on_ready" });
    await setWorkflowAutoStartAction(W, true);
    expect(workflowsRepo.setWorkflowAutoStart).toHaveBeenCalledWith(W, true, "actor-1");
    expect(revalidatePath).toHaveBeenCalledWith("/proyectos");
    await expect(setWorkflowAutoStartAction(W, "yes" as unknown as boolean)).rejects.toThrow("INVALID");
  });
});

describe("positions-actions (§7.2)", () => {
  it("reads for any staff session", async () => {
    caps.canManagePositions = false;
    positionsRepo.listPositions.mockResolvedValue([]);
    await expect(fetchPositionsAction()).resolves.toEqual([]);
  });

  it("rejects every write without the puestos capability", async () => {
    caps.canManagePositions = false;
    await expect(createPositionAction({ name: "Diseñador" })).rejects.toThrow("FORBIDDEN");
    await expect(updatePositionAction(P, { name: "Diseñador" })).rejects.toThrow("FORBIDDEN");
    await expect(deletePositionAction(P)).rejects.toThrow("FORBIDDEN");
    await expect(setPositionPhasesAction(P, [F1])).rejects.toThrow("FORBIDDEN");
    await expect(reorderPositionsAction([P])).rejects.toThrow("FORBIDDEN");
    expect(positionsRepo.createPosition).not.toHaveBeenCalled();
  });

  it("validates names and ids", async () => {
    await expect(createPositionAction({ name: " " })).rejects.toThrow("EMPTY");
    await expect(updatePositionAction("bad", { name: "X" })).rejects.toThrow("INVALID");
    await expect(setPositionPhasesAction(P, ["bad"])).rejects.toThrow("INVALID: 0");
    await expect(reorderPositionsAction(Array.from({ length: 501 }, () => P))).rejects.toThrow("INVALID");
  });

  it("creates, dedupes fases and revalidates Google on delete", async () => {
    positionsRepo.createPosition.mockResolvedValue({ id: P });
    await createPositionAction({ name: " Residente " });
    expect(positionsRepo.createPosition).toHaveBeenCalledWith({ name: "Residente" });
    expect(revalidatePath).toHaveBeenCalledWith("/configuracion/puestos");
    expect(revalidatePath).toHaveBeenCalledWith("/equipo");

    await setPositionPhasesAction(P, [F1, F2, F1]);
    expect(positionsRepo.setPositionPhases).toHaveBeenCalledWith(P, [F1, F2]);

    await deletePositionAction(P);
    expect(positionsRepo.softDeletePosition).toHaveBeenCalledWith(P);
    expect(revalidatePath).toHaveBeenCalledWith("/configuracion/google");
  });
});

describe("setStaffPositionsAction (§7.2)", () => {
  beforeEach(() => {
    staffRepo.staffExists.mockResolvedValue(true);
    staffRepo.listStaffPositionIds.mockResolvedValue([F1]);
    staffRepo.googleManagedStaffIds.mockResolvedValue(new Set());
    staffRepo.hasPositionGroupMappings.mockResolvedValue(true);
  });

  it("rejects without canEditCollaborator, bad ids and unknown staff", async () => {
    caps.canEditCollaborator = false;
    await expect(setStaffPositionsAction(S1, [P])).rejects.toThrow("FORBIDDEN");
    caps.canEditCollaborator = true;
    await expect(setStaffPositionsAction("bad", [P])).rejects.toThrow("INVALID");
    staffRepo.staffExists.mockResolvedValue(false);
    await expect(setStaffPositionsAction(S1, [P])).rejects.toThrow("NOT_FOUND");
    expect(positionsRepo.setStaffPositions).not.toHaveBeenCalled();
  });

  it("refuses a change for Google-managed staff while position mappings exist", async () => {
    staffRepo.googleManagedStaffIds.mockResolvedValue(new Set([S1]));
    await expect(setStaffPositionsAction(S1, [F1, P])).resolves.toEqual(GOOGLE_MANAGED_REFUSAL);
    expect(positionsRepo.setStaffPositions).not.toHaveBeenCalled();
    // Sending the workspace puestos back is not a change.
    await expect(setStaffPositionsAction(S1, [F1])).resolves.toBeUndefined();
    expect(positionsRepo.setStaffPositions).toHaveBeenCalledWith(S1, [F1]);
  });

  it("lets Google-managed staff change when no position mapping exists", async () => {
    staffRepo.googleManagedStaffIds.mockResolvedValue(new Set([S1]));
    staffRepo.hasPositionGroupMappings.mockResolvedValue(false);
    await setStaffPositionsAction(S1, [P]);
    expect(positionsRepo.setStaffPositions).toHaveBeenCalledWith(S1, [P]);
  });

  it("dedupes the ids; the repository replaces only the manual rows", async () => {
    await setStaffPositionsAction(S1, [F1, P, P]);
    expect(positionsRepo.setStaffPositions).toHaveBeenCalledWith(S1, [F1, P]);
    expect(revalidatePath).toHaveBeenCalledWith("/configuracion/puestos");
  });
});

describe("espacios actions (§7.3)", () => {
  it("returns [] without canViewProjects", async () => {
    caps.canViewProjects = false;
    await expect(fetchProjectSpacesAction(P)).resolves.toEqual([]);
    expect(spacesRepo.listSpaces).not.toHaveBeenCalled();
  });

  it("rejects writes without canEditProjectGeneral", async () => {
    caps.canEditProjectGeneral = false;
    await expect(createProjectSpaceAction(P, "Cocina")).rejects.toThrow("FORBIDDEN");
    await expect(renameProjectSpaceAction(S1, "Cocina")).rejects.toThrow("FORBIDDEN");
    await expect(reorderProjectSpacesAction(P, [S1])).rejects.toThrow("FORBIDDEN");
    await expect(deleteProjectSpaceAction(S1)).rejects.toThrow("FORBIDDEN");
  });

  it("validates names and ids", async () => {
    await expect(createProjectSpaceAction(P, "  ")).rejects.toThrow("EMPTY");
    await expect(renameProjectSpaceAction(S1, "x".repeat(121))).rejects.toThrow("INVALID");
    await expect(deleteProjectSpaceAction("bad")).rejects.toThrow("INVALID");
    expect(spacesRepo.createSpace).not.toHaveBeenCalled();
  });

  it("creates, renames and deletes with revalidation", async () => {
    spacesRepo.createSpace.mockResolvedValue({ id: S1, projectId: P });
    spacesRepo.renameSpace.mockResolvedValue({ id: S1, projectId: P });
    await createProjectSpaceAction(P, " Cocina ");
    expect(spacesRepo.createSpace).toHaveBeenCalledWith(P, "Cocina");
    await renameProjectSpaceAction(S1, "Baño");
    expect(revalidatePath).toHaveBeenCalledWith(`/proyectos/${P}/ficha`);
    await deleteProjectSpaceAction(S1);
    expect(spacesRepo.deleteSpace).toHaveBeenCalledWith(S1, "actor-1");
  });
});

describe("tramo-start-actions (§7.4)", () => {
  const input = {
    projectId: P,
    workflowId: W,
    phaseIds: [F1, F2],
    assignment: { mode: "self" as const },
  };

  beforeEach(() => {
    flow.startTramo.mockResolvedValue({ batchId: B, createdCount: 2 });
    staffRepo.liveActiveStaffIds.mockImplementation(async (ids: string[]) => new Set(ids.filter((id) => id === S1)));
  });

  it("reads need canViewActivities", async () => {
    caps.canViewActivities = false;
    await expect(fetchTramoBoardAction(W)).rejects.toThrow("FORBIDDEN");
    await expect(previewStartTramoAction(P, W)).rejects.toThrow("FORBIDDEN");
  });

  it("passes the viewer scope to the board", async () => {
    caps.admin = false;
    await fetchTramoBoardAction(W);
    expect(flow.tramoBoard).toHaveBeenCalledWith(expect.anything(), W, { staffId: "actor-1", isAdmin: false });
    await expect(fetchTramoBoardAction("bad")).rejects.toThrow("INVALID");
  });

  it("start and undo need canCreateActivity", async () => {
    caps.canCreateActivity = false;
    await expect(startTramoAction(input)).rejects.toThrow("FORBIDDEN");
    await expect(undoStartTramoAction(B)).rejects.toThrow("FORBIDDEN");
    expect(flow.startTramo).not.toHaveBeenCalled();
  });

  it("autoStart is admin only", async () => {
    caps.admin = false;
    await expect(startTramoAction({ ...input, autoStart: true })).rejects.toThrow("FORBIDDEN");
    await expect(startTramoAction(input)).resolves.toMatchObject({ batchId: B });
  });

  it("validates the input shape", async () => {
    await expect(startTramoAction({ ...input, projectId: "bad" })).rejects.toThrow("INVALID: projectId");
    await expect(
      startTramoAction({ ...input, assignment: { mode: "other" } as unknown as typeof input.assignment })
    ).rejects.toThrow("INVALID");
    await expect(
      startTramoAction({ ...input, phaseIds: Array.from({ length: 51 }, () => F1) })
    ).rejects.toThrow("INVALID: phaseIds");
  });

  it("by_phase managers must be live, active staff", async () => {
    await expect(
      startTramoAction({ ...input, assignment: { mode: "by_phase", managers: { [F1]: S1, [F2]: S2 } } })
    ).rejects.toThrow("INVALID: managers");
    await startTramoAction({ ...input, assignment: { mode: "by_phase", managers: { [F1]: S1, [F2]: null } } });
    expect(flow.startTramo).toHaveBeenCalledTimes(1);
  });

  it("starts in a transaction as a manual trigger and revalidates", async () => {
    await startTramoAction({ ...input, autoStart: true });
    expect(flow.startTramo).toHaveBeenCalledWith(tx, {
      projectId: P,
      workflowId: W,
      phaseIds: [F1, F2],
      assignment: { mode: "self" },
      actorId: "actor-1",
      trigger: "manual",
      autoStart: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/actividades", "layout");
    expect(revalidatePath).toHaveBeenCalledWith(`/proyectos/${P}/ficha`);
    expect(revalidatePath).toHaveBeenCalledWith("/mis-tareas");
  });

  it("undoes a batch in a transaction", async () => {
    await undoStartTramoAction(B);
    expect(flow.undoStartTramo).toHaveBeenCalledWith(tx, B, "actor-1");
    await expect(undoStartTramoAction("bad")).rejects.toThrow("INVALID");
  });
});
