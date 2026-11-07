import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "44444444-4444-4444-8444-444444444444";
const MISSING_PROJECT = "44444444-4444-4444-8444-555555555555";
const PRESALE = "11111111-1111-4111-8111-111111111111";
const DISENO = "11111111-1111-4111-8111-222222222222";
const CLIENT = "66666666-6666-4666-8666-666666666666";

const session = vi.hoisted(() => ({ access: "Colaborador" }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "33333333-3333-4333-8333-333333333333" },
    access: session.access,
  })),
}));

const caps = vi.hoisted(() => ({ canChangeProjectStage: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => ({
    canViewProjects: true,
    canCreateProject: true,
    canEditProjectGeneral: true,
    canChangeProjectStage: caps.canChangeProjectStage,
    canArchiveProject: true,
    canDeleteProject: true,
    canEditProtectedProjectData: true,
    canExportData: true,
  }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", () => ({ after: (cb: () => unknown) => afterCallbacks.push(cb) }));

vi.mock("@/lib/db/client", () => ({
  db: { transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({})) },
}));

vi.mock("@/lib/google/project-folders-app", () => ({
  syncProjectFolders: vi.fn(),
  syncProjectFolderName: vi.fn(),
  retryProjectFolders: vi.fn(),
}));

const flow = vi.hoisted(() => ({
  startTramo: vi.fn(),
}));
vi.mock("@/lib/project-flow/start-tramo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/project-flow/start-tramo")>()),
  ...flow,
}));

type Stage = { workflowId: string };
const state = vi.hoisted(() => ({
  stages: [] as Stage[],
  current: null as string | null,
  takenNames: new Set<string>(),
}));

const repo = vi.hoisted(() => ({
  getProject: vi.fn(),
  projectExists: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  setProjectCurrentTramo: vi.fn(),
}));
vi.mock("@/lib/repositories/projects-repository", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/repositories/projects-repository")>()),
  ...repo,
}));

import {
  createProjectAction,
  setProjectCurrentTramoAction,
  updateProjectAction,
} from "./projects-actions";

function project() {
  return {
    id: PROJECT,
    name: "Casa Valle",
    clientId: null,
    client: null,
    currentWorkflowId: state.current,
    currentWorkflow: state.current ? { id: state.current, key: "x", name: "Tramo" } : null,
    needsTramo: state.current === null,
    tramos: state.stages.map((s) => ({
      workflow: { id: s.workflowId, key: "x", name: "Tramo" },
      current: s.workflowId === state.current,
    })),
  };
}

async function runAfter() {
  for (const cb of afterCallbacks.splice(0)) await cb();
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  session.access = "Colaborador";
  caps.canChangeProjectStage = true;
  state.stages = [{ workflowId: PRESALE }];
  state.current = PRESALE;
  state.takenNames = new Set(["casa existente"]);

  repo.projectExists.mockImplementation(async (id: string) => id === PROJECT);
  repo.getProject.mockImplementation(async (id: string) => (id === PROJECT ? project() : null));
  repo.setProjectCurrentTramo.mockImplementation(async (id: string, workflowId: string) => {
    if (id !== PROJECT) throw new Error("NOT_FOUND");
    if (!state.stages.some((s) => s.workflowId === workflowId)) throw new Error("NOT_STARTED");
    state.current = workflowId;
    return project();
  });
  flow.startTramo.mockImplementation(
    async (_tx: unknown, params: { projectId: string; workflowId: string; stageOnly?: boolean }) => {
      state.stages.push({ workflowId: params.workflowId });
      state.current = params.workflowId;
      return {
        batchId: null,
        stageCreated: true,
        currentChanged: true,
        createdCount: 0,
        skippedCount: 0,
        tasks: [],
      };
    }
  );
  repo.createProject.mockImplementation(async (input: { name: string }) => {
    const name = (input.name ?? "").trim();
    if (!name) throw new Error("EMPTY");
    if (state.takenNames.has(name.toLowerCase())) throw new Error("NAME_TAKEN");
    // createProject (BE §9.4) starts Presale on create with its 10 template tasks, unassigned.
    state.stages = [{ workflowId: PRESALE }];
    state.current = PRESALE;
    return { ...project(), name };
  });
  repo.updateProject.mockImplementation(async (_id: string, patch: { name?: string }) => {
    if (patch.name && state.takenNames.has(patch.name.trim().toLowerCase())) throw new Error("NAME_TAKEN");
    return project();
  });
});

describe("setProjectCurrentTramoAction", () => {
  it("moves the current tramo to a started one", async () => {
    state.stages.push({ workflowId: DISENO });
    const row = await setProjectCurrentTramoAction(PROJECT, DISENO);
    expect(row.currentWorkflow?.id).toBe(DISENO);
    expect(repo.setProjectCurrentTramo).toHaveBeenCalledWith(PROJECT, DISENO, ACTOR);
    expect(flow.startTramo).not.toHaveBeenCalled();
  });

  it("throws NOT_STARTED for a tramo the project hasn't started", async () => {
    await expect(setProjectCurrentTramoAction(PROJECT, DISENO)).rejects.toThrow(/^NOT_STARTED/);
    expect(flow.startTramo).not.toHaveBeenCalled();
    expect(state.current).toBe(PRESALE);
  });

  it("throws NOT_STARTED for an admin when the project already has a current tramo", async () => {
    session.access = "Administrador";
    await expect(setProjectCurrentTramoAction(PROJECT, DISENO)).rejects.toThrow(/^NOT_STARTED/);
    expect(flow.startTramo).not.toHaveBeenCalled();
  });

  it("lets an admin assign a tramo to a project without one, through startTramo stageOnly", async () => {
    session.access = "Administrador";
    state.stages = [];
    state.current = null;
    const row = await setProjectCurrentTramoAction(PROJECT, DISENO);
    expect(flow.startTramo).toHaveBeenCalledTimes(1);
    expect(flow.startTramo).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ projectId: PROJECT, workflowId: DISENO, stageOnly: true, actorId: ACTOR })
    );
    expect(row.currentWorkflow?.id).toBe(DISENO);
  });

  it("refuses the stage-only path to non-admins (NOT_STARTED)", async () => {
    state.stages = [];
    state.current = null;
    await expect(setProjectCurrentTramoAction(PROJECT, DISENO)).rejects.toThrow(/^NOT_STARTED/);
    expect(flow.startTramo).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an unknown project", async () => {
    await expect(setProjectCurrentTramoAction(MISSING_PROJECT, PRESALE)).rejects.toThrow(/^NOT_FOUND/);
  });

  it("throws FORBIDDEN without canChangeProjectStage", async () => {
    caps.canChangeProjectStage = false;
    await expect(setProjectCurrentTramoAction(PROJECT, PRESALE)).rejects.toThrow(/^FORBIDDEN/);
    expect(repo.setProjectCurrentTramo).not.toHaveBeenCalled();
    expect(flow.startTramo).not.toHaveBeenCalled();
  });
});

describe("createProjectAction", () => {
  it("creates a project with a name only and returns it with Presale started", async () => {
    const row = await createProjectAction({ name: "  Casa Nueva " } as never);
    expect(repo.createProject).toHaveBeenCalledTimes(1);
    const [input, actor] = repo.createProject.mock.calls[0];
    expect((input as { name: string }).name.trim()).toBe("Casa Nueva");
    expect(input).not.toHaveProperty("clientId", expect.any(String));
    expect(actor).toBe(ACTOR);
    expect(row.currentWorkflow?.id).toBe(PRESALE);
    expect(row.needsTramo).toBe(false);
    // The Presale start happens inside createProject (one transaction), never as a second start.
    expect(flow.startTramo).not.toHaveBeenCalled();
  });

  it("schedules the Drive folders after the response", async () => {
    const folders = await import("@/lib/google/project-folders-app");
    await createProjectAction({ name: "Casa Nueva" } as never);
    expect(folders.syncProjectFolders).not.toHaveBeenCalled();
    await runAfter();
    expect(folders.syncProjectFolders).toHaveBeenCalledWith(PROJECT);
  });

  it("throws EMPTY for a blank name", async () => {
    await expect(createProjectAction({ name: "   " } as never)).rejects.toThrow(/^EMPTY$/);
  });

  it("throws NAME_TAKEN for the name of an active project", async () => {
    await expect(createProjectAction({ name: "Casa Existente" } as never)).rejects.toThrow(/^NAME_TAKEN/);
  });
});

describe("updateProjectAction", () => {
  it("throws NAME_TAKEN when renaming to an active project's name", async () => {
    await expect(updateProjectAction(PROJECT, { name: "casa existente" })).rejects.toThrow(/^NAME_TAKEN/);
  });

  it.each([{ clientId: CLIENT }, { origin: "Recomendación" }, { originStaffId: ACTOR }])(
    "refuses admin-only keys from a non-admin (%o)",
    async (patch) => {
      await expect(updateProjectAction(PROJECT, patch)).rejects.toThrow(/^FORBIDDEN/);
      expect(repo.updateProject).not.toHaveBeenCalled();
    }
  );

  it("accepts a client from an administrator", async () => {
    session.access = "Administrador";
    await expect(updateProjectAction(PROJECT, { clientId: CLIENT })).resolves.toMatchObject({ id: PROJECT });
    expect(repo.updateProject).toHaveBeenCalled();
  });
});
