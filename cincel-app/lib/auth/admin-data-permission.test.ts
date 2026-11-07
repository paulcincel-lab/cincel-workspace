import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, TeamMember } from "@/lib/auth/auth-service";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn(() => null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import { canSeeAdminData } from "@/lib/auth/permissions";

function makeUser(access: SystemAccessRole): AuthenticatedUser {
  const member: TeamMember = {
    id: "00000000-0000-0000-0000-000000000999",
    name: "Test User",
    phone: "+52 000 000 0000",
    institutionalEmail: "test@cincel.mx",
    role: access,
    area: "General",
    capacity: 8,
    availability: "Disponible",
    active: true,
    authStatus: {
      authEnabled: true,
      hasPasswordHash: true,
      mustChangePassword: false,
      passwordUpdatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
  };
  return { member, email: "test@cincel.mx", access };
}

describe("canSeeAdminData", () => {
  it.each(SYSTEM_ACCESS_ROLES)("for %s is true only when the access is Administrador", (role) => {
    expect(canSeeAdminData(makeUser(role))).toBe(role === "Administrador");
  });

  it("is false for Dirección, which manages structure but not admin data", () => {
    expect(canSeeAdminData(makeUser("Dirección"))).toBe(false);
  });

  it("is false without a user", () => {
    expect(canSeeAdminData(null)).toBe(false);
    expect(canSeeAdminData(undefined)).toBe(false);
  });
});
