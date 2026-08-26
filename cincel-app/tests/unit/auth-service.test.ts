import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory localStorage substitute so tests run without a real browser environment.
const store: Record<string, string> = {};

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: (key: string) => store[key] ?? null,
  writeStorage: (key: string, value: string) => {
    store[key] = value;
  },
  removeStorage: (key: string) => {
    delete store[key];
  },
  readJsonStorage: <T>(key: string, fallback: T): T => {
    const raw = store[key];
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
}));

import {
  hashPassword,
  normalizeEmail,
  getCollaboratorAccessState,
  loginWithEmailAndPassword,
  AUTH_SESSION_STORAGE_KEY,
} from "@/lib/auth/auth-service";
import type { TeamMember } from "@/lib/data/team";

const TEAM_MEMBERS_KEY = "cincel.team.members.v1";
const SYSTEM_ROLES_KEY = "cincel.team.system-roles.v1";

// ── Pure functions ────────────────────────────────────────────────────────────

describe("hashPassword", () => {
  it("returns a deterministic hex string", () => {
    const hash = hashPassword("Temporal123");
    expect(hash).toMatch(/^[0-9a-f]{8}$/);
    expect(hashPassword("Temporal123")).toBe(hash);
  });

  it("trims the password before hashing", () => {
    expect(hashPassword("  Temporal123  ")).toBe(hashPassword("Temporal123"));
  });

  it("produces different hashes for different passwords", () => {
    expect(hashPassword("Temporal123")).not.toBe(hashPassword("Temporal456"));
  });
});

describe("normalizeEmail", () => {
  it("lowercases the email", () => {
    expect(normalizeEmail("PAUL@CINCEL.MX")).toBe("paul@cincel.mx");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  paul@cincel.mx  ")).toBe("paul@cincel.mx");
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMember(overrides: Partial<TeamMember["auth"]> = {}): TeamMember {
  return {
    id: 1,
    name: "Test",
    birthDate: "1990-01-01",
    nationality: "Mexicana",
    phone: "+52 000 000 0000",
    institutionalEmail: "test@cincel.mx",
    address: "Test",
    maritalStatus: "Soltero",
    homePhone: "",
    personalEmail: "",
    curp: "TEST900101HTST000",
    rfc: "TEST9001015A1",
    emergencyContact: { name: "", relation: "", phone: "", address: "" },
    role: "Colaborador",
    area: "General",
    capacity: 8,
    availability: "Disponible",
    active: true,
    auth: {
      passwordHash: hashPassword("Temporal123"),
      authEnabled: true,
      mustChangePassword: false,
      passwordUpdatedAt: "2026-01-01T00:00:00.000Z",
      lastLoginAt: null,
      ...overrides,
    },
  };
}

// ── getCollaboratorAccessState ────────────────────────────────────────────────

describe("getCollaboratorAccessState", () => {
  it("returns 'Sin acceso al sistema' when authEnabled is false", () => {
    const state = getCollaboratorAccessState(makeMember({ authEnabled: false }));
    expect(state.hasSystemAccess).toBe(false);
    expect(state.status).toBe("Sin acceso al sistema");
  });

  it("returns 'Sin contraseña temporal' when no passwordHash", () => {
    const state = getCollaboratorAccessState(makeMember({ passwordHash: "" }));
    expect(state.hasSystemAccess).toBe(true);
    expect(state.status).toBe("Sin contraseña temporal");
  });

  it("returns 'Pendiente de primer acceso' when mustChangePassword is true", () => {
    const state = getCollaboratorAccessState(makeMember({ mustChangePassword: true }));
    expect(state.status).toBe("Pendiente de primer acceso");
  });

  it("returns 'Pendiente de primer acceso' when passwordUpdatedAt is null", () => {
    const state = getCollaboratorAccessState(makeMember({ passwordUpdatedAt: null }));
    expect(state.status).toBe("Pendiente de primer acceso");
  });

  it("returns 'Acceso activo' for a fully configured member", () => {
    const state = getCollaboratorAccessState(makeMember());
    expect(state.hasSystemAccess).toBe(true);
    expect(state.status).toBe("Acceso activo");
  });
});

// ── loginWithEmailAndPassword ─────────────────────────────────────────────────

function seedMember(member: TeamMember, role = "Colaborador"): void {
  store[TEAM_MEMBERS_KEY] = JSON.stringify([member]);
  store[SYSTEM_ROLES_KEY] = JSON.stringify({ [member.id]: role });
}

describe("loginWithEmailAndPassword", () => {
  beforeEach(() => {
    delete store[TEAM_MEMBERS_KEY];
    delete store[SYSTEM_ROLES_KEY];
    delete store[AUTH_SESSION_STORAGE_KEY];
  });

  it("succeeds with correct credentials", () => {
    const member = makeMember();
    seedMember(member);
    const result = loginWithEmailAndPassword("test@cincel.mx", "Temporal123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.collaboratorId).toBe(1);
    }
  });

  it("fails with wrong password", () => {
    const member = makeMember();
    seedMember(member);
    const result = loginWithEmailAndPassword("test@cincel.mx", "WrongPassword");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_credentials");
    }
  });

  it("fails when member not found", () => {
    const result = loginWithEmailAndPassword("unknown@cincel.mx", "Temporal123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_credentials");
    }
  });

  it("fails when member is inactive", () => {
    const member = { ...makeMember(), active: false };
    seedMember(member);
    const result = loginWithEmailAndPassword("test@cincel.mx", "Temporal123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("inactive_member");
    }
  });

  it("fails when auth is disabled", () => {
    const member = makeMember({ authEnabled: false });
    seedMember(member);
    const result = loginWithEmailAndPassword("test@cincel.mx", "Temporal123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("auth_disabled");
    }
  });

  it("fails when no password hash is set", () => {
    const member = makeMember({ passwordHash: "" });
    seedMember(member);
    const result = loginWithEmailAndPassword("test@cincel.mx", "Temporal123");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("password_not_set");
    }
  });

  it("persists a session on success", () => {
    const member = makeMember();
    seedMember(member);
    loginWithEmailAndPassword("test@cincel.mx", "Temporal123");
    const rawSession = store[AUTH_SESSION_STORAGE_KEY];
    expect(rawSession).toBeTruthy();
    const session = JSON.parse(rawSession);
    expect(session.email).toBe("test@cincel.mx");
  });

  it("is case-insensitive for email", () => {
    const member = makeMember();
    seedMember(member);
    const result = loginWithEmailAndPassword("TEST@CINCEL.MX", "Temporal123");
    expect(result.ok).toBe(true);
  });
});
