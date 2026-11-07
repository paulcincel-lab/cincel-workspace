import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { ProjectDetail, ViewerScope } from "@/lib/types/core";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn(() => null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import { scopeProjectDto, scopeTaskDto, viewerScopeOf } from "@/lib/auth/viewer-scope";

const admin: ViewerScope = { staffId: "a", isAdmin: true };
const member: ViewerScope = { staffId: "m", isAdmin: false };

const user = (access: string) => ({ member: { id: "s1" }, email: "x@cincel.mx", access }) as unknown as AuthenticatedUser;

describe("viewerScopeOf", () => {
  it("is admin for Administrador only", () => {
    expect(viewerScopeOf(user("Administrador"))).toEqual({ staffId: "s1", isAdmin: true });
    expect(viewerScopeOf(user("Dirección"))).toEqual({ staffId: "s1", isAdmin: false });
    expect(viewerScopeOf(user("Colaborador"))).toEqual({ staffId: "s1", isAdmin: false });
  });
});

describe("scopeProjectDto", () => {
  const project = {
    id: "p1",
    clientId: "c1",
    origin: "Referido",
    originStaffId: "s9",
    client: { id: "c1", name: "Cliente", type: "cliente" },
    originStaff: { id: "s9", name: "Ana" },
    mondayImport: { boards: [{ id: "b1", name: "Tablero" }] },
  } as unknown as ProjectDetail;

  it("keeps everything for admins", () => {
    expect(scopeProjectDto(project, admin)).toBe(project);
  });

  it("nulls client, origin and monday import for non-admins", () => {
    expect(scopeProjectDto(project, member)).toMatchObject({
      id: "p1",
      clientId: null,
      origin: null,
      originStaffId: null,
      client: null,
      originStaff: null,
      mondayImport: null,
    });
    // The input is not mutated.
    expect(project.clientId).toBe("c1");
  });

  it("doesn't add detail keys to a plain project", () => {
    const plain = { id: "p2", clientId: "c1", origin: null, originStaffId: null };
    expect(scopeProjectDto(plain, member)).toEqual({ id: "p2", clientId: null, origin: null, originStaffId: null });
  });
});

describe("scopeTaskDto", () => {
  const task = { id: "t1", project: { id: "p1", name: "Casa", clientName: "Cliente" } };

  it("nulls the client name for non-admins only", () => {
    expect(scopeTaskDto(task, member).project).toEqual({ id: "p1", name: "Casa", clientName: null });
    expect(scopeTaskDto(task, admin)).toBe(task);
  });
});
