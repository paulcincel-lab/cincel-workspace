import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canView: true,
  listProjects: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveProjectsCapabilities: () => ({ canViewProjects: mocks.canView }),
}));
vi.mock("@/lib/auth/viewer-scope", () => ({
  viewerScopeOf: () => ({ staffId: "s1", isAdmin: false }),
}));
vi.mock("@/lib/repositories/projects-repository", () => ({ listProjects: mocks.listProjects }));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { loadShellProjects } from "@/lib/shell/projects";

const user = {} as AuthenticatedUser;

beforeEach(() => {
  mocks.canView = true;
  mocks.listProjects.mockReset();
});

describe("loadShellProjects", () => {
  it("reads with the viewer scope and keeps id, name, status and the etapa color", async () => {
    mocks.listProjects.mockResolvedValue([
      { id: "p1", name: "Casa", status: "activo", currentWorkflow: { key: "presale", sortOrder: 1, colorSlot: null } },
      { id: "p2", name: "Torre", status: "pausado", currentWorkflow: null, client: { name: "no" } },
    ]);
    const rows = await loadShellProjects(user);
    expect(mocks.listProjects).toHaveBeenCalledWith({}, { staffId: "s1", isAdmin: false });
    expect(rows).toEqual([
      { id: "p1", name: "Casa", status: "activo", colorVar: "var(--chart-1)" },
      { id: "p2", name: "Torre", status: "pausado", colorVar: "var(--muted-foreground)" },
    ]);
  });

  it("returns nothing, without reading, for a viewer who cannot view projects", async () => {
    mocks.canView = false;
    expect(await loadShellProjects(user)).toEqual([]);
    expect(mocks.listProjects).not.toHaveBeenCalled();
  });
});
