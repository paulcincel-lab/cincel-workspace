import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkflowDetail, WorkflowTaskTemplateInput } from "@/lib/types/core";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const WORKFLOW = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKFLOW = "11111111-1111-4111-8111-222222222222";
const PHASE = "22222222-2222-4222-8222-111111111111";
const OTHER_PHASE = "22222222-2222-4222-8222-222222222222";
const TEMPLATE = "66666666-6666-4666-8666-666666666666";

const session = vi.hoisted(() => ({ access: "Colaborador" }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "33333333-3333-4333-8333-333333333333" },
    access: session.access,
  })),
}));

const caps = vi.hoisted(() => ({ canView: false, canManage: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveWorkflowsCapabilities: () => ({
    canViewWorkflows: caps.canView,
    canManageWorkflows: caps.canManage,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));

const workflowsRepo = vi.hoisted(() => ({
  listWorkflows: vi.fn(),
  getWorkflow: vi.fn(),
  listTramosNav: vi.fn(),
  setWorkflowAutoStart: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
}));
vi.mock("@/lib/repositories/workflows-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/workflows-repository")>()),
  ...workflowsRepo,
}));

const phasesRepo = vi.hoisted(() => ({
  createPhase: vi.fn(),
  updatePhase: vi.fn(),
  reorderPhases: vi.fn(),
  assertPhaseInWorkflow: vi.fn(),
}));
vi.mock("@/lib/repositories/workflow-phases-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/workflow-phases-repository")>()),
  ...phasesRepo,
}));

import {
  createTemplateAction,
  createWorkflowPhaseAction,
  fetchTramosNavAction,
  fetchWorkflowsAction,
  setWorkflowAutoStartAction,
  updateTemplateAction,
  updateWorkflowPhaseAction,
} from "./workflows-actions";

const activeRows = [
  { id: WORKFLOW, key: "presale", name: "Presale", active: true, phases: [], templates: [] },
] as unknown as WorkflowDetail[];

/** Fase rule of the template repository and of `assertPhaseInWorkflow` (whichever the action uses). */
function phaseMismatch(phaseId: string | undefined, workflowId: string) {
  if (phaseId === OTHER_PHASE && workflowId === WORKFLOW) throw new Error("PHASE_MISMATCH");
}

beforeEach(() => {
  vi.clearAllMocks();
  session.access = "Colaborador";
  caps.canView = false;
  caps.canManage = false;
  workflowsRepo.listWorkflows.mockResolvedValue(activeRows);
  workflowsRepo.listTramosNav.mockResolvedValue([{ id: WORKFLOW, key: "presale", name: "Presale" }]);
  workflowsRepo.setWorkflowAutoStart.mockResolvedValue({ id: WORKFLOW, autoStart: "on_create" });
  workflowsRepo.createTemplate.mockImplementation(
    async (workflowId: string, input: { phaseId?: string; title: string }) => {
      if (!input.phaseId) throw new Error("INVALID: phaseId");
      phaseMismatch(input.phaseId, workflowId);
      if (input.title === "Duplicada") throw new Error("NAME_TAKEN");
      return { id: TEMPLATE, workflowId, ...input };
    }
  );
  workflowsRepo.updateTemplate.mockImplementation(
    async (id: string, patch: { phaseId?: string; title?: string }) => {
      phaseMismatch(patch.phaseId, WORKFLOW);
      if (patch.title === "Duplicada") throw new Error("NAME_TAKEN");
      return { id, workflowId: WORKFLOW, phaseId: PHASE, title: "Plantilla", ...patch };
    }
  );
  phasesRepo.assertPhaseInWorkflow.mockImplementation(
    async (_tx: unknown, phaseId: string, workflowId: string) => phaseMismatch(phaseId, workflowId)
  );
  phasesRepo.createPhase.mockImplementation(async (workflowId: string, input: { name: string }) => {
    if (!input.name.trim()) throw new Error("EMPTY");
    if (input.name.trim().toLowerCase() === "cobro") throw new Error("NAME_TAKEN");
    if (workflowId === OTHER_WORKFLOW) throw new Error("NOT_FOUND");
    return { id: PHASE, workflowId, name: input.name.trim(), active: true, sortOrder: 5 };
  });
  phasesRepo.updatePhase.mockImplementation(async (id: string, patch: { name?: string }) => {
    if (patch.name !== undefined && !patch.name.trim()) throw new Error("EMPTY");
    if (patch.name?.trim().toLowerCase() === "cobro") throw new Error("NAME_TAKEN");
    return { id, workflowId: WORKFLOW, name: patch.name ?? "Inicial", active: true, sortOrder: 0 };
  });
});

describe("fetchWorkflowsAction", () => {
  it("returns active tramos to any staff session, even without the view capability", async () => {
    await expect(fetchWorkflowsAction()).resolves.toEqual(activeRows);
    expect(workflowsRepo.listWorkflows).toHaveBeenCalledTimes(1);
    const [opts] = workflowsRepo.listWorkflows.mock.calls[0] ?? [{}];
    expect(opts?.includeInactive).toBeFalsy();
    expect(opts?.includeInactiveTemplates).toBeFalsy();
    expect(opts?.includeInactivePhases).toBeFalsy();
  });

  it.each([
    { includeInactive: true },
    { includeInactiveTemplates: true },
    { includeInactivePhases: true },
  ])("never reads inactive rows for staff without canManageWorkflows (%o)", async (opts) => {
    caps.canView = true;
    const outcome = await fetchWorkflowsAction(opts).catch((err: unknown) => err);
    if (outcome instanceof Error) {
      expect(outcome.message).toMatch(/^FORBIDDEN/);
      expect(workflowsRepo.listWorkflows).not.toHaveBeenCalled();
    } else {
      for (const [called] of workflowsRepo.listWorkflows.mock.calls) {
        expect(called?.includeInactive).toBeFalsy();
        expect(called?.includeInactiveTemplates).toBeFalsy();
        expect(called?.includeInactivePhases).toBeFalsy();
      }
    }
  });

  it("passes the inactive flags through for canManageWorkflows", async () => {
    caps.canView = true;
    caps.canManage = true;
    session.access = "Administrador";
    const opts = { includeInactive: true, includeInactiveTemplates: true, includeInactivePhases: true };
    await fetchWorkflowsAction(opts);
    expect(workflowsRepo.listWorkflows).toHaveBeenCalledWith(expect.objectContaining(opts));
  });
});

describe("fetchTramosNavAction", () => {
  it("returns the active tramos to any staff session", async () => {
    await expect(fetchTramosNavAction()).resolves.toEqual([
      { id: WORKFLOW, key: "presale", name: "Presale" },
    ]);
  });
});

describe("createTemplateAction", () => {
  beforeEach(() => {
    caps.canView = true;
    caps.canManage = true;
    session.access = "Administrador";
  });

  it("creates a template in a fase of its tramo", async () => {
    const row = await createTemplateAction(WORKFLOW, { phaseId: PHASE, title: "Levantamiento" });
    expect(row).toMatchObject({ id: TEMPLATE, phaseId: PHASE });
    expect(workflowsRepo.createTemplate).toHaveBeenCalledWith(
      WORKFLOW,
      expect.objectContaining({ phaseId: PHASE, title: "Levantamiento" }),
      ACTOR
    );
  });

  it("refuses a template without a fase", async () => {
    await expect(createTemplateAction(WORKFLOW, { title: "Sin fase" } as WorkflowTaskTemplateInput)).rejects.toThrow(
      /^(INVALID|PHASE_MISMATCH)/
    );
  });

  it("throws PHASE_MISMATCH for a fase of another tramo", async () => {
    await expect(
      createTemplateAction(WORKFLOW, { phaseId: OTHER_PHASE, title: "Levantamiento" })
    ).rejects.toThrow(/^PHASE_MISMATCH/);
  });

  it("throws NAME_TAKEN for the same title in that fase", async () => {
    await expect(createTemplateAction(WORKFLOW, { phaseId: PHASE, title: "Duplicada" })).rejects.toThrow(
      /^NAME_TAKEN/
    );
  });

  it("throws FORBIDDEN without canManageWorkflows", async () => {
    caps.canManage = false;
    session.access = "Colaborador";
    await expect(createTemplateAction(WORKFLOW, { phaseId: PHASE, title: "x" })).rejects.toThrow(
      /^FORBIDDEN/
    );
    expect(workflowsRepo.createTemplate).not.toHaveBeenCalled();
  });
});

describe("updateTemplateAction", () => {
  beforeEach(() => {
    caps.canView = true;
    caps.canManage = true;
    session.access = "Administrador";
  });

  it("moves a template to another fase of the same tramo", async () => {
    await expect(updateTemplateAction(TEMPLATE, { phaseId: PHASE })).resolves.toMatchObject({
      id: TEMPLATE,
      phaseId: PHASE,
    });
  });

  it("throws PHASE_MISMATCH for a fase of another tramo", async () => {
    await expect(updateTemplateAction(TEMPLATE, { phaseId: OTHER_PHASE })).rejects.toThrow(
      /^PHASE_MISMATCH/
    );
  });

  it("throws NAME_TAKEN for a title already used in the fase", async () => {
    await expect(updateTemplateAction(TEMPLATE, { title: "Duplicada" })).rejects.toThrow(/^NAME_TAKEN/);
  });

  it("throws FORBIDDEN without canManageWorkflows", async () => {
    caps.canManage = false;
    session.access = "Colaborador";
    await expect(updateTemplateAction(TEMPLATE, { title: "x" })).rejects.toThrow(/^FORBIDDEN/);
    expect(workflowsRepo.updateTemplate).not.toHaveBeenCalled();
  });
});

describe("fase actions", () => {
  beforeEach(() => {
    caps.canView = true;
    caps.canManage = true;
    session.access = "Administrador";
  });

  it("appends a fase", async () => {
    await expect(createWorkflowPhaseAction(WORKFLOW, { name: "Revisión" })).resolves.toMatchObject({
      workflowId: WORKFLOW,
      name: "Revisión",
    });
  });

  it("throws EMPTY for a blank name", async () => {
    await expect(createWorkflowPhaseAction(WORKFLOW, { name: "   " })).rejects.toThrow(/^EMPTY$/);
    await expect(updateWorkflowPhaseAction(PHASE, { name: "" })).rejects.toThrow(/^EMPTY$/);
  });

  it("throws NAME_TAKEN for a name already in the tramo", async () => {
    await expect(createWorkflowPhaseAction(WORKFLOW, { name: "Cobro" })).rejects.toThrow(/^NAME_TAKEN/);
    await expect(updateWorkflowPhaseAction(PHASE, { name: "cobro" })).rejects.toThrow(/^NAME_TAKEN/);
  });

  it("throws NOT_FOUND for an unknown tramo", async () => {
    await expect(createWorkflowPhaseAction(OTHER_WORKFLOW, { name: "Revisión" })).rejects.toThrow(
      /^NOT_FOUND/
    );
  });

  it("throws FORBIDDEN for staff without canManageWorkflows", async () => {
    caps.canManage = false;
    session.access = "Colaborador";
    await expect(createWorkflowPhaseAction(WORKFLOW, { name: "Revisión" })).rejects.toThrow(/^FORBIDDEN/);
    await expect(updateWorkflowPhaseAction(PHASE, { name: "Revisión" })).rejects.toThrow(/^FORBIDDEN/);
    expect(phasesRepo.createPhase).not.toHaveBeenCalled();
    expect(phasesRepo.updatePhase).not.toHaveBeenCalled();
  });
});

describe("setWorkflowAutoStartAction", () => {
  it("stores the switch for canManageWorkflows", async () => {
    caps.canManage = true;
    session.access = "Administrador";
    await expect(setWorkflowAutoStartAction(WORKFLOW, true)).resolves.toMatchObject({ id: WORKFLOW });
    expect(workflowsRepo.setWorkflowAutoStart).toHaveBeenCalledWith(WORKFLOW, true, ACTOR);
  });

  it("throws FORBIDDEN for staff", async () => {
    await expect(setWorkflowAutoStartAction(WORKFLOW, true)).rejects.toThrow(/^FORBIDDEN/);
    expect(workflowsRepo.setWorkflowAutoStart).not.toHaveBeenCalled();
  });
});
