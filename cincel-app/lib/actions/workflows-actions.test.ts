import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const WORKFLOW = "44444444-4444-4444-8444-444444444444";
const PHASE = "55555555-5555-4555-8555-555555555555";
const TEMPLATE = "66666666-6666-4666-8666-666666666666";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, access: "Colaborador" })),
}));

const caps = vi.hoisted(() => ({ canView: false, canManage: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveWorkflowsCapabilities: () => ({ canViewWorkflows: caps.canView, canManageWorkflows: caps.canManage }),
}));

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

const repo = vi.hoisted(() => ({
  listWorkflows: vi.fn(),
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deactivateTemplate: vi.fn(),
  reorderTemplates: vi.fn(),
}));
vi.mock("@/lib/repositories/workflows-repository", () => repo);

import {
  createTemplateAction,
  deactivateTemplateAction,
  fetchWorkflowsAction,
  updateTemplateAction,
} from "./workflows-actions";

beforeEach(() => {
  vi.clearAllMocks();
  caps.canView = false;
  caps.canManage = false;
  repo.listWorkflows.mockResolvedValue([{ id: WORKFLOW }]);
  repo.createTemplate.mockResolvedValue({ id: TEMPLATE });
  repo.updateTemplate.mockResolvedValue({ id: TEMPLATE });
  repo.deactivateTemplate.mockResolvedValue({ id: TEMPLATE });
});

describe("fetchWorkflowsAction", () => {
  it("returns the active rows to any staff session, even without canViewWorkflows", async () => {
    await expect(fetchWorkflowsAction()).resolves.toEqual([{ id: WORKFLOW }]);
    expect(repo.listWorkflows).toHaveBeenCalledWith({});
  });

  it.each([
    { includeInactive: true },
    { includeInactiveTemplates: true },
    { includeInactivePhases: true },
  ])("ignores %o without canManageWorkflows", async (opts) => {
    caps.canView = true;
    await expect(fetchWorkflowsAction(opts)).resolves.toEqual([{ id: WORKFLOW }]);
    expect(repo.listWorkflows).toHaveBeenCalledWith({});
  });

  it("passes the inactive flags through with canManageWorkflows", async () => {
    caps.canManage = true;
    await fetchWorkflowsAction({ includeInactive: true, includeInactivePhases: true });
    expect(repo.listWorkflows).toHaveBeenCalledWith({ includeInactive: true, includeInactivePhases: true });
  });
});

describe("createTemplateAction", () => {
  it("is FORBIDDEN without canManageWorkflows", async () => {
    await expect(createTemplateAction(WORKFLOW, { phaseId: PHASE, title: "Planos" })).rejects.toThrow(/^FORBIDDEN/);
    expect(repo.createTemplate).not.toHaveBeenCalled();
  });

  it("requires phaseId", async () => {
    caps.canManage = true;
    await expect(
      createTemplateAction(WORKFLOW, { title: "Planos" } as unknown as Parameters<typeof createTemplateAction>[1])
    ).rejects.toThrow("INVALID: phaseId");
    await expect(createTemplateAction(WORKFLOW, { phaseId: "", title: "Planos" })).rejects.toThrow("INVALID: phaseId");
    expect(repo.createTemplate).not.toHaveBeenCalled();
  });

  it("rejects a blank title with EMPTY", async () => {
    caps.canManage = true;
    await expect(createTemplateAction(WORKFLOW, { phaseId: PHASE, title: "   " })).rejects.toThrow("EMPTY");
  });

  it("creates with the parsed input and revalidates tramos and the Actividades layout", async () => {
    caps.canManage = true;
    await createTemplateAction(WORKFLOW, { phaseId: PHASE, title: "  Planos  " });
    expect(repo.createTemplate).toHaveBeenCalledWith(WORKFLOW, { phaseId: PHASE, title: "Planos" }, ACTOR);
    expect(revalidatePath).toHaveBeenCalledWith("/configuracion/tramos");
    expect(revalidatePath).toHaveBeenCalledWith("/actividades", "layout");
  });

  it.each(["PHASE_MISMATCH", "NAME_TAKEN"])("passes %s through from the repository", async (code) => {
    caps.canManage = true;
    repo.createTemplate.mockRejectedValueOnce(new Error(code));
    await expect(createTemplateAction(WORKFLOW, { phaseId: PHASE, title: "Planos" })).rejects.toThrow(code);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateTemplateAction", () => {
  it("is FORBIDDEN without canManageWorkflows", async () => {
    await expect(updateTemplateAction(TEMPLATE, { title: "Otro" })).rejects.toThrow(/^FORBIDDEN/);
  });

  it("rejects an explicit empty phaseId", async () => {
    caps.canManage = true;
    await expect(updateTemplateAction(TEMPLATE, { phaseId: "" })).rejects.toThrow("INVALID: phaseId");
    expect(repo.updateTemplate).not.toHaveBeenCalled();
  });

  it("forwards a partial patch", async () => {
    caps.canManage = true;
    await updateTemplateAction(TEMPLATE, { phaseId: PHASE });
    expect(repo.updateTemplate).toHaveBeenCalledWith(TEMPLATE, { phaseId: PHASE }, ACTOR);
  });

  it.each(["PHASE_MISMATCH", "NAME_TAKEN", "INVALID: phaseId"])(
    "passes %s through from the repository",
    async (code) => {
      caps.canManage = true;
      repo.updateTemplate.mockRejectedValueOnce(new Error(code));
      await expect(updateTemplateAction(TEMPLATE, { title: "Otro" })).rejects.toThrow(code);
    }
  );
});

describe("deactivateTemplateAction", () => {
  it("revalidates the tramos page", async () => {
    caps.canManage = true;
    await deactivateTemplateAction(TEMPLATE);
    expect(revalidatePath).toHaveBeenCalledWith("/configuracion/tramos");
  });
});
