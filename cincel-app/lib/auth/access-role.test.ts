import { afterEach, describe, expect, it, vi } from "vitest";

import { isStaffAdministrator, staffAccessRole } from "@/lib/auth/access-role";
import { SYSTEM_ACCESS_ROLES } from "@/lib/data/roles";

describe("staffAccessRole", () => {
  it.each(SYSTEM_ACCESS_ROLES)("keeps the official role %s", (role) => {
    expect(staffAccessRole(role, "someone@cincel.mx")).toBe(role);
  });

  it("normalizes case and surrounding spaces of the administrator role", () => {
    expect(staffAccessRole("  administrador ", null)).toBe("Administrador");
  });

  it("maps legacy aliases", () => {
    expect(staffAccessRole("Director", null)).toBe("Dirección");
    expect(staffAccessRole("Responsable de proyecto", null)).toBe("Jefe de Taller");
    expect(staffAccessRole("usuario", null)).toBe("Colaborador");
  });

  it("blocks the legacy Cliente role", () => {
    expect(staffAccessRole("Cliente", "someone@cincel.mx")).toBeNull();
    expect(staffAccessRole("cliente", null)).toBeNull();
  });

  it("falls back to Colaborador for an unknown or empty role", () => {
    expect(staffAccessRole("Diseñador", null)).toBe("Colaborador");
    expect(staffAccessRole(null, null)).toBe("Colaborador");
    expect(staffAccessRole("", "someone@cincel.mx")).toBe("Colaborador");
  });
});

describe("staffAccessRole with CINCEL_ADMIN_EMAILS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("escalates a listed email with no official role to Administrador", async () => {
    vi.stubEnv("CINCEL_ADMIN_EMAILS", "Boss@Cincel.mx");
    vi.resetModules();
    const accessRole = await import("@/lib/auth/access-role");

    expect(accessRole.staffAccessRole(null, "boss@cincel.mx")).toBe("Administrador");
    expect(accessRole.staffAccessRole("Diseñador", " BOSS@cincel.mx ")).toBe("Administrador");
    expect(accessRole.staffAccessRole(null, "other@cincel.mx")).toBe("Colaborador");
  });

  it("keeps the official role of a listed email", async () => {
    vi.stubEnv("CINCEL_ADMIN_EMAILS", "boss@cincel.mx");
    vi.resetModules();
    const accessRole = await import("@/lib/auth/access-role");

    expect(accessRole.staffAccessRole("Colaborador", "boss@cincel.mx")).toBe("Colaborador");
  });
});

describe("isStaffAdministrator", () => {
  it("is true only for the Administrador access role", () => {
    for (const role of SYSTEM_ACCESS_ROLES) {
      expect(isStaffAdministrator(role, null)).toBe(role === "Administrador");
    }
    expect(isStaffAdministrator("Cliente", null)).toBe(false);
    expect(isStaffAdministrator(null, null)).toBe(false);
  });
});
