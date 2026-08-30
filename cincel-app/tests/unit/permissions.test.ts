import { describe, it, expect, vi } from "vitest";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";

// Stub storage so the permissions module doesn't depend on browser localStorage.
// This focuses the tests on the default permissions matrix, not the override system.
vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import {
  resolveDashboardCapabilitiesFromDefaults,
  resolveActivitiesCapabilitiesFromDefaults,
  resolveProjectsCapabilitiesFromDefaults,
  resolveClientsCapabilitiesFromDefaults,
  resolveTeamCapabilitiesFromDefaults,
  resolveClientsCapabilities,
  resolveTeamCapabilities,
  resolveActivitiesCapabilities,
  resolveProjectsCapabilities,
} from "@/lib/auth/permissions";
import type { TeamMember } from "@/lib/data/team";

// These capability functions are pure table lookups — no storage access needed.
// The resolve*Capabilities (without FromDefaults) read localStorage only for custom overrides;
// with an empty localStorage they fall through to defaults, so they're safe to test here too.

function makeUser(role: SystemAccessRole): AuthenticatedUser {
  const member: TeamMember = {
    id: 999,
    name: "Test User",
    birthDate: "1990-01-01",
    nationality: "Mexicana",
    phone: "+52 000 000 0000",
    institutionalEmail: "test@cincel.mx",
    address: "Test Address",
    maritalStatus: "Soltero",
    homePhone: "+52 000 000 0001",
    personalEmail: "test@personal.mx",
    curp: "TEST900101HTST000",
    rfc: "TEST9001015A1",
    emergencyContact: {
      name: "EC Name",
      relation: "Familiar",
      phone: "+52 000 000 0002",
      address: "EC Address",
    },
    role: "Colaborador",
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
  return { member, email: "test@cincel.mx", access: role };
}

// ── Dashboard capabilities ────────────────────────────────────────────────────

describe("resolveDashboardCapabilitiesFromDefaults", () => {
  it("gives global dataScope to Administrador", () => {
    const caps = resolveDashboardCapabilitiesFromDefaults(makeUser("Administrador"));
    expect(caps.dataScope).toBe("global");
  });

  it("gives global dataScope to Dirección", () => {
    const caps = resolveDashboardCapabilitiesFromDefaults(makeUser("Dirección"));
    expect(caps.dataScope).toBe("global");
  });

  it("gives managed_projects dataScope to Jefe de Taller", () => {
    const caps = resolveDashboardCapabilitiesFromDefaults(makeUser("Jefe de Taller"));
    expect(caps.dataScope).toBe("managed_projects");
  });

  it("gives assigned_tasks dataScope to Colaborador", () => {
    const caps = resolveDashboardCapabilitiesFromDefaults(makeUser("Colaborador"));
    expect(caps.dataScope).toBe("assigned_tasks");
  });

  it("gives assigned_tasks dataScope to Pasante / Servicio Social", () => {
    const caps = resolveDashboardCapabilitiesFromDefaults(makeUser("Pasante / Servicio Social"));
    expect(caps.dataScope).toBe("assigned_tasks");
    expect(caps.sections.showProjectAssignments).toBe(false);
    expect(caps.sections.showTeamWorkload).toBe(false);
  });

  it("returns Colaborador defaults for null user", () => {
    const caps = resolveDashboardCapabilitiesFromDefaults(null);
    expect(caps.dataScope).toBe("assigned_tasks");
  });
});

// ── Activities (Tareas) capabilities ─────────────────────────────────────────

describe("resolveActivitiesCapabilitiesFromDefaults — canDeleteActivity", () => {
  it("Administrador can delete activities", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Administrador")).canDeleteActivity).toBe(true);
  });

  it("Dirección can delete activities", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Dirección")).canDeleteActivity).toBe(true);
  });

  it("Jefe de Taller cannot delete activities", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Jefe de Taller")).canDeleteActivity).toBe(false);
  });

  it("Arquitecto Senior cannot delete activities", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Arquitecto Senior")).canDeleteActivity).toBe(false);
  });

  it("Arquitecto Junior cannot delete activities", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Arquitecto Junior")).canDeleteActivity).toBe(false);
  });

  it("Colaborador cannot delete activities", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Colaborador")).canDeleteActivity).toBe(false);
  });

  it("Pasante / Servicio Social cannot delete activities", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Pasante / Servicio Social")).canDeleteActivity).toBe(false);
  });

  it("Otros cannot delete activities", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Otros")).canDeleteActivity).toBe(false);
  });
});

describe("resolveActivitiesCapabilitiesFromDefaults — statusScope", () => {
  it("Administrador sees all statuses", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Administrador")).statusScope).toBe("all");
  });

  it("Arquitecto Junior sees only assigned_or_participant statuses", () => {
    expect(resolveActivitiesCapabilitiesFromDefaults(makeUser("Arquitecto Junior")).statusScope).toBe("assigned_or_participant");
  });
});

// ── Projects capabilities ─────────────────────────────────────────────────────

describe("resolveProjectsCapabilitiesFromDefaults — canDeleteProject", () => {
  it("Administrador can delete projects", () => {
    expect(resolveProjectsCapabilitiesFromDefaults(makeUser("Administrador")).canDeleteProject).toBe(true);
  });

  it("Dirección can delete projects", () => {
    expect(resolveProjectsCapabilitiesFromDefaults(makeUser("Dirección")).canDeleteProject).toBe(true);
  });

  it("Jefe de Taller cannot delete projects", () => {
    expect(resolveProjectsCapabilitiesFromDefaults(makeUser("Jefe de Taller")).canDeleteProject).toBe(false);
  });

  it("Colaborador cannot delete projects", () => {
    expect(resolveProjectsCapabilitiesFromDefaults(makeUser("Colaborador")).canDeleteProject).toBe(false);
  });
});

// ── Clients capabilities ──────────────────────────────────────────────────────

describe("resolveClientsCapabilitiesFromDefaults — canDeleteClient", () => {
  it("Administrador can delete clients", () => {
    expect(resolveClientsCapabilitiesFromDefaults(makeUser("Administrador")).canDeleteClient).toBe(true);
  });

  it("Dirección can delete clients", () => {
    expect(resolveClientsCapabilitiesFromDefaults(makeUser("Dirección")).canDeleteClient).toBe(true);
  });

  it("Jefe de Taller cannot delete clients", () => {
    expect(resolveClientsCapabilitiesFromDefaults(makeUser("Jefe de Taller")).canDeleteClient).toBe(false);
  });

  it("Arquitecto Junior cannot delete clients", () => {
    expect(resolveClientsCapabilitiesFromDefaults(makeUser("Arquitecto Junior")).canDeleteClient).toBe(false);
  });

  it("Colaborador cannot delete clients", () => {
    expect(resolveClientsCapabilitiesFromDefaults(makeUser("Colaborador")).canDeleteClient).toBe(false);
  });

  it("Pasante / Servicio Social cannot delete clients", () => {
    expect(resolveClientsCapabilitiesFromDefaults(makeUser("Pasante / Servicio Social")).canDeleteClient).toBe(false);
  });
});

// ── Team capabilities ─────────────────────────────────────────────────────────

describe("resolveTeamCapabilitiesFromDefaults — canDeleteCollaborator", () => {
  it("Administrador can delete collaborators", () => {
    expect(resolveTeamCapabilitiesFromDefaults(makeUser("Administrador")).canDeleteCollaborator).toBe(true);
  });

  it("Dirección cannot delete collaborators", () => {
    expect(resolveTeamCapabilitiesFromDefaults(makeUser("Dirección")).canDeleteCollaborator).toBe(false);
  });

  it("Colaborador cannot delete collaborators", () => {
    expect(resolveTeamCapabilitiesFromDefaults(makeUser("Colaborador")).canDeleteCollaborator).toBe(false);
  });
});

// ── Export permissions (canExportData restricted to admin/dirección) ───────────

describe("resolveClientsCapabilities — canExportData gated by role", () => {
  it("Administrador can export clients data", () => {
    expect(resolveClientsCapabilities(makeUser("Administrador")).canExportData).toBe(true);
  });

  it("Dirección can export clients data", () => {
    expect(resolveClientsCapabilities(makeUser("Dirección")).canExportData).toBe(true);
  });

  it("Jefe de Taller cannot export clients data even if defaults allow it", () => {
    expect(resolveClientsCapabilities(makeUser("Jefe de Taller")).canExportData).toBe(false);
  });

  it("Colaborador cannot export clients data", () => {
    expect(resolveClientsCapabilities(makeUser("Colaborador")).canExportData).toBe(false);
  });
});

describe("resolveTeamCapabilities — canExportData gated by role", () => {
  it("Administrador can export team data", () => {
    expect(resolveTeamCapabilities(makeUser("Administrador")).canExportData).toBe(true);
  });

  it("Colaborador cannot export team data", () => {
    expect(resolveTeamCapabilities(makeUser("Colaborador")).canExportData).toBe(false);
  });
});

describe("resolveActivitiesCapabilities — canExportData gated by role", () => {
  it("Administrador can export activities data", () => {
    expect(resolveActivitiesCapabilities(makeUser("Administrador")).canExportData).toBe(true);
  });

  it("Colaborador cannot export activities data", () => {
    expect(resolveActivitiesCapabilities(makeUser("Colaborador")).canExportData).toBe(false);
  });
});

describe("resolveProjectsCapabilities — canExportData gated by role", () => {
  it("Administrador can export projects data", () => {
    expect(resolveProjectsCapabilities(makeUser("Administrador")).canExportData).toBe(true);
  });

  it("Arquitecto Junior cannot export projects data", () => {
    expect(resolveProjectsCapabilities(makeUser("Arquitecto Junior")).canExportData).toBe(false);
  });
});
