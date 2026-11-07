import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "22222222-2222-4222-8222-222222222222";

const session = vi.hoisted(() => ({ access: "Administrador" }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "staff-1" },
    email: "x@cincel.mx",
    access: session.access,
  })),
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: true }),
  canSeeAdminData: (user: { access?: string } | null) => user?.access === "Administrador",
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/google/project-folders-app", () => ({
  retryProjectFolders: vi.fn(),
  syncProjectFolderName: vi.fn(),
  syncProjectFolders: vi.fn(),
}));
const repo = vi.hoisted(() => ({ getProject: vi.fn() }));
vi.mock("@/lib/repositories/projects-repository", () => repo);

import { fetchProjectAction } from "./projects-actions";

beforeEach(() => {
  vi.clearAllMocks();
  session.access = "Administrador";
});

describe("fetchProjectAction mondayImport", () => {
  it("asks for the admin-only fields (mondayImport) for an Administrador", async () => {
    await fetchProjectAction(PROJECT);
    expect(repo.getProject).toHaveBeenCalledWith(PROJECT, { staffId: "staff-1", isAdmin: true });
  });

  it("leaves mondayImport out for anyone else, Dirección included", async () => {
    for (const access of ["Dirección", "Colaborador"]) {
      session.access = access;
      repo.getProject.mockClear();
      await fetchProjectAction(PROJECT);
      expect(repo.getProject).toHaveBeenCalledWith(PROJECT, { staffId: "staff-1", isAdmin: false });
    }
  });
});
