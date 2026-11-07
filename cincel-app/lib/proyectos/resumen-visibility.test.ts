// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";

// Custom permission overrides live in localStorage; stub it so the tests use the default matrix.
vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn((_key: string, fallback: unknown) => fallback),
}));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";
import { fixtureProject } from "@/tests/unit/fixtures/project-summary";

import { canSeeClientContacts, isProjectMember, scopeProjectForResumen } from "./resumen-visibility";

function user(id: string, access: SystemAccessRole): AuthenticatedUser {
  return {
    member: {
      id,
      name: id,
      role: "",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: `${id}@cincel.mx`,
      phone: "",
    },
    email: `${id}@cincel.mx`,
    access,
  } as AuthenticatedUser;
}

const project = fixtureProject();

describe("isProjectMember", () => {
  it("counts the responsable, the coordinador and active members", () => {
    expect(isProjectMember(project, "s1")).toBe(true);
    expect(isProjectMember(project, "s2")).toBe(true);
    expect(isProjectMember(project, "s3")).toBe(true);
    expect(isProjectMember(project, "s9")).toBe(false);
  });

  it("ignores inactive members", () => {
    const p = fixtureProject({
      manager: null,
      coordinator: null,
      members: [{ id: "s3", name: "Ana", role: null, active: false }],
    });
    expect(isProjectMember(p, "s3")).toBe(false);
  });
});

describe("canSeeClientContacts (B8)", () => {
  it("lets an administrator see them on any project", () => {
    expect(canSeeClientContacts(user("s9", "Administrador"), project)).toBe(true);
  });

  it("lets a member with clients.canViewClients see them", () => {
    expect(canSeeClientContacts(user("s3", "Jefe de Construcción"), project)).toBe(true);
  });

  it("hides them from a non-member even with clients.canViewClients", () => {
    expect(canSeeClientContacts(user("s9", "Jefe de Construcción"), project)).toBe(false);
  });

  it("hides them from a member without clients.canViewClients", () => {
    expect(canSeeClientContacts(user("s3", "Colaborador"), project)).toBe(false);
  });

  it("hides them from a non-member without clients.canViewClients", () => {
    expect(canSeeClientContacts(user("s9", "Colaborador"), project)).toBe(false);
  });
});

describe("scopeProjectForResumen", () => {
  it("drops the client and the contacts when they may not be seen", () => {
    const scoped = scopeProjectForResumen(project, false);
    expect(scoped.client).toBeNull();
    expect(scoped.contacts).toEqual([]);
    expect(scoped.members).toEqual(project.members);
  });

  it("keeps them otherwise", () => {
    expect(scopeProjectForResumen(project, true)).toBe(project);
  });
});
