/**
 * Client-side auth facade.
 *
 * Phase 2/3: the source of truth is now the server session (opaque cookie over
 * `core.sessions`, see `lib/auth/session.ts`). This module keeps its historical
 * synchronous API for the many feature components that call
 * `getCurrentAuthenticatedUser()` / `resolveCurrentSessionAccess()` outside of
 * hooks — it reads the server-resolved decision that `SessionHydrator` mirrors
 * into the Zustand `session-store`.
 *
 * Login / logout / password changes are Server Actions (`lib/auth/auth-actions.ts`).
 */
import type { SystemAccessRole } from "@/lib/data/roles";
import type { TeamMemberPublic } from "@/lib/data/team-public";
import type { SessionAccess, SessionAccessStatus } from "@/lib/auth/session";
import { useSessionStore } from "@/lib/stores/session-store";

export type TeamMember = TeamMemberPublic;

export type AuthSession = {
  collaboratorId: number;
  email: string;
  access: SystemAccessRole;
  loggedAt: string;
};

export type AuthenticatedUser = {
  member: TeamMember;
  email: string;
  access: SystemAccessRole;
};

export type { SessionAccessStatus };

export type SessionAccessResolution = {
  status: SessionAccessStatus;
  user: AuthenticatedUser | null;
};

export type CollaboratorAccessStatus =
  | "Sin acceso al sistema"
  | "Sin contraseña temporal"
  | "Pendiente de primer acceso"
  | "Acceso activo";

export type CollaboratorAccessState = {
  hasSystemAccess: boolean;
  status: CollaboratorAccessStatus;
  hasPasswordHash: boolean;
  authEnabled: boolean;
  mustChangePassword: boolean;
  passwordUpdatedAt: string | null;
  lastLoginAt: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// ── Session reads (backed by the Zustand mirror of the server session) ───────

function toAuthenticatedUser(access: SessionAccess): AuthenticatedUser | null {
  if (!access.user) return null;
  const u = access.user;
  const member: TeamMember = {
    id: u.legacyId ?? 0,
    name: u.name,
    role: u.role ?? "",
    area: u.area ?? "",
    capacity: 0,
    availability: "",
    active: u.active,
    institutionalEmail: u.email ?? "",
    phone: "",
  };
  return { member, email: normalizeEmail(u.email ?? ""), access: u.access };
}

export function resolveCurrentSessionAccess(): SessionAccessResolution {
  const access = useSessionStore.getState().access;
  return { status: access.status, user: toAuthenticatedUser(access) };
}

export function getCurrentAuthenticatedUser(): AuthenticatedUser | null {
  const { status } = useSessionStore.getState().access;
  if (status !== "active") return null;
  return toAuthenticatedUser(useSessionStore.getState().access);
}

export function getCurrentAuthenticatedMember(): TeamMember | null {
  return getCurrentAuthenticatedUser()?.member ?? null;
}

export function getCurrentSession(): AuthSession | null {
  const user = getCurrentAuthenticatedUser();
  if (!user) return null;
  return {
    collaboratorId: user.member.id,
    email: user.email,
    access: user.access,
    loggedAt: new Date().toISOString(),
  };
}

export function logout(): void {
  useSessionStore.getState().setAccess({ status: "guest", user: null });
  void import("@/lib/auth/auth-actions").then((m) => m.logoutAction());
}

// ── Collaborator access state (used by profile / equipo views) ───────────────

export function getCollaboratorAccessState(
  member: Pick<TeamMemberPublic, "active"> & { authStatus?: TeamMemberPublic["authStatus"] }
): CollaboratorAccessState {
  const authStatus = member.authStatus;
  const authEnabled = authStatus?.authEnabled ?? false;
  const hasPasswordHash = authStatus?.hasPasswordHash ?? false;
  const mustChangePassword = authStatus?.mustChangePassword ?? false;

  if (!authEnabled) {
    return {
      hasSystemAccess: false,
      status: "Sin acceso al sistema",
      hasPasswordHash,
      authEnabled,
      mustChangePassword,
      passwordUpdatedAt: authStatus?.passwordUpdatedAt ?? null,
      lastLoginAt: authStatus?.lastLoginAt ?? null,
    };
  }

  const status: CollaboratorAccessStatus = !hasPasswordHash
    ? "Sin contraseña temporal"
    : mustChangePassword
      ? "Pendiente de primer acceso"
      : "Acceso activo";

  return {
    hasSystemAccess: true,
    status,
    hasPasswordHash,
    authEnabled,
    mustChangePassword,
    passwordUpdatedAt: authStatus?.passwordUpdatedAt ?? null,
    lastLoginAt: authStatus?.lastLoginAt ?? null,
  };
}
