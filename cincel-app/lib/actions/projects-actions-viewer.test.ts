import { unwrapActions } from "@/tests/helpers/action-result";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Project reads pass the viewer scope; stage results are scoped for non-admins (project flow BE §8.5, §12). */

const ACTOR = "33333333-3333-4333-8333-333333333333";
const PROJECT = "55555555-5555-4555-8555-555555555555";
const WORKFLOW = "66666666-6666-4666-8666-666666666666";

const session = vi.hoisted(() => ({ access: "Colaborador" as string }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({ member: { id: ACTOR }, access: session.access })),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => ({ canViewProjects: true, canChangeProjectStage: true }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/google/project-folders-app", () => ({
  syncProjectFolders: vi.fn(),
  syncProjectFolderName: vi.fn(),
  retryProjectFolders: vi.fn(),
}));

const detail = {
  id: PROJECT,
  clientId: "c1",
  origin: "Referido",
  originStaffId: "s1",
  client: { id: "c1", name: "Cliente", type: "cliente" },
  originStaff: { id: "s1", name: "Ana" },
  mondayImport: null,
};

const repo = vi.hoisted(() => ({
  listProjects: vi.fn(async () => []),
  getProject: vi.fn(async () => null),
  setProjectCurrentEtapa: vi.fn(),
  assignProjectEtapa: vi.fn(),
}));
vi.mock("@/lib/repositories/projects-repository", () => repo);

import * as projectsActionsModule from "./projects-actions";
const {
  fetchProjectAction,
  fetchProjectsAction,
  setProjectCurrentEtapaAction,
} = unwrapActions(projectsActionsModule);

beforeEach(() => {
  vi.clearAllMocks();
  session.access = "Colaborador";
  repo.setProjectCurrentEtapa.mockResolvedValue(detail);
  repo.assignProjectEtapa.mockResolvedValue(detail);
});

describe("project reads", () => {
  it("pass a non-admin scope", async () => {
    await fetchProjectsAction({ search: "Casa" });
    expect(repo.listProjects).toHaveBeenCalledWith({ search: "Casa" }, { staffId: ACTOR, isAdmin: false });
    await fetchProjectAction(PROJECT);
    expect(repo.getProject).toHaveBeenCalledWith(PROJECT, { staffId: ACTOR, isAdmin: false });
  });

  it("pass an admin scope for Administrador", async () => {
    session.access = "Administrador";
    await fetchProjectAction(PROJECT);
    expect(repo.getProject).toHaveBeenCalledWith(PROJECT, { staffId: ACTOR, isAdmin: true });
  });
});

describe("current etapa changes", () => {
  it("return no client or origin to a non-admin", async () => {
    expect(await setProjectCurrentEtapaAction(PROJECT, WORKFLOW)).toMatchObject({
      clientId: null,
      origin: null,
      originStaffId: null,
      client: null,
      originStaff: null,
    });
  });

  it("keep them for an administrator", async () => {
    session.access = "Administrador";
    expect(await setProjectCurrentEtapaAction(PROJECT, WORKFLOW)).toMatchObject({ clientId: "c1", client: { name: "Cliente" } });
  });
});
