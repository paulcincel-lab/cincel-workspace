import { describe, it, expect } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  normalizeEmail,
  getCollaboratorAccessState,
} from "@/lib/auth/auth-service";

// ── scrypt password hashing (lib/auth/password.ts) ───────────────────────────

describe("hashPassword / verifyPassword", () => {
  it("round-trips a correct password", async () => {
    const { hash, salt } = await hashPassword("Temporal123!");
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(await verifyPassword("Temporal123!", hash, salt)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const { hash, salt } = await hashPassword("Temporal123!");
    expect(await verifyPassword("wrong", hash, salt)).toBe(false);
  });

  it("uses a random salt per call", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
});

// ── normalizeEmail ──────────────────────────────────────────────────────────

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  PAUL@CINCEL.MX  ")).toBe("paul@cincel.mx");
  });
});

// ── getCollaboratorAccessState ──────────────────────────────────────────────

describe("getCollaboratorAccessState", () => {
  const base = { active: true };

  it("returns 'Sin acceso al sistema' when authEnabled is false", () => {
    const state = getCollaboratorAccessState({
      ...base,
      auth: {
        passwordHash: "x",
        authEnabled: false,
        mustChangePassword: false,
        passwordUpdatedAt: null,
        lastLoginAt: null,
      },
    });
    expect(state.hasSystemAccess).toBe(false);
    expect(state.status).toBe("Sin acceso al sistema");
  });

  it("returns 'Pendiente de primer acceso' when mustChangePassword is true", () => {
    const state = getCollaboratorAccessState({
      ...base,
      auth: {
        passwordHash: "x",
        authEnabled: true,
        mustChangePassword: true,
        passwordUpdatedAt: null,
        lastLoginAt: null,
      },
    });
    expect(state.status).toBe("Pendiente de primer acceso");
  });

  it("returns 'Acceso activo' for a configured member with no auth block", () => {
    const state = getCollaboratorAccessState(base);
    expect(state.hasSystemAccess).toBe(true);
    expect(state.status).toBe("Acceso activo");
  });
});
