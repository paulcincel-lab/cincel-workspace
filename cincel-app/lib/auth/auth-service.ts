import { DEFAULT_SYSTEM_ACCESS_ROLE, hasDefaultSystemAdministratorAccess, isAdministratorRole, isLegacyBlockedAccessRole, normalizeSystemAccessRole, SYSTEM_ACCESS_ROLES, SYSTEM_ADMIN_ROLE, type SystemAccessRole } from "@/lib/data/roles";
import { teamMembersPublic, type TeamMemberPublic } from "@/lib/data/team-public";
import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";
import { signOutFromSupabase } from "@/lib/auth/supabase-auth";
import { getCachedSupabaseUser } from "@/lib/supabase/client";
import { isSupabaseEnabled } from "@/lib/supabase/data-source";

// TeamMember alias for backward-compatibility with callers that import this type
// from auth-service. The auth layer only needs the public (non-PII) fields.
export type TeamMember = TeamMemberPublic;

export const AUTH_SESSION_STORAGE_KEY = "cincel.auth.session.v1";
const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";
const SYSTEM_ROLE_STORAGE_KEY = "cincel.team.system-roles.v1";
const DEFAULT_ADMIN_MEMBER_EMAIL = "paul@cincel.mx";
const DEFAULT_ADMIN_BOOTSTRAP_PASSWORD = "CincelAdmin2026!";
const DEFAULT_ADMIN_BOOTSTRAP_PASSWORD_HASH = hashPassword(DEFAULT_ADMIN_BOOTSTRAP_PASSWORD);

type PersistedSystemRoleMap = Record<number, string>;

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

export type CollaboratorAccessStatus = "Sin acceso al sistema" | "Sin contraseña temporal" | "Pendiente de primer acceso" | "Acceso activo";

export type CollaboratorAccessState = {
  hasSystemAccess: boolean;
  status: CollaboratorAccessStatus;
  hasPasswordHash: boolean;
  authEnabled: boolean;
  mustChangePassword: boolean;
  passwordUpdatedAt: string | null;
  lastLoginAt: string | null;
};

export type LoginResult =
  | { ok: true; session: AuthSession; requiresPasswordChange: boolean }
  | {
      ok: false;
      reason:
        | "invalid_credentials"
        | "inactive_member"
        | "access_not_allowed"
        | "auth_disabled"
        | "password_not_set";
    };

export type PasswordChangeResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "invalid_current_password"
        | "invalid_password"
        | "password_too_short"
        | "password_confirmation_mismatch"
        | "no_session"
        | "inactive_member"
        | "no_system_access";
    };

export type SessionAccessStatus =
  | "guest"
  | "inactive_member"
  | "no_system_access"
  | "pending_first_access"
  | "active";

export type SessionAccessResolution = {
  status: SessionAccessStatus;
  user: AuthenticatedUser | null;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function simpleHash(value: string): string {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function hashPassword(password: string): string {
  return simpleHash(password.trim());
}

function loadMembers(): TeamMemberPublic[] {
  if (!canUseStorage()) {
    return teamMembersPublic;
  }

  const stored = readStorage(TEAM_MEMBERS_STORAGE_KEY);
  if (!stored) {
    return teamMembersPublic;
  }

  try {
    const parsed = JSON.parse(stored) as TeamMemberPublic[];
    return Array.isArray(parsed) ? parsed : teamMembersPublic;
  } catch {
    return teamMembersPublic;
  }
}

function persistMembers(members: TeamMemberPublic[]): void {
  if (!canUseStorage()) {
    return;
  }

  writeStorage(TEAM_MEMBERS_STORAGE_KEY, JSON.stringify(members));
}

function loadSystemAccessMap(): PersistedSystemRoleMap {
  if (!canUseStorage()) {
    return {};
  }

  const stored = readStorage(SYSTEM_ROLE_STORAGE_KEY);
  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as PersistedSystemRoleMap;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

function resolveAccess(member: TeamMemberPublic, roleByMemberId: PersistedSystemRoleMap): SystemAccessRole | null {
  const configuredRaw = roleByMemberId[member.id];

  if (isLegacyBlockedAccessRole(configuredRaw)) {
    return null;
  }

  const configured = normalizeSystemAccessRole(configuredRaw);
  if (configured && SYSTEM_ACCESS_ROLES.includes(configured)) {
    return configured;
  }

  if (isAdministratorRole(member.role) || hasDefaultSystemAdministratorAccess(member.institutionalEmail)) {
    return SYSTEM_ADMIN_ROLE;
  }

  if (isLegacyBlockedAccessRole(member.role)) {
    return null;
  }

  return DEFAULT_SYSTEM_ACCESS_ROLE;
}

function verifyPassword(plainPassword: string, passwordHash: string): boolean {
  const normalizedPassword = plainPassword.trim();
  if (!normalizedPassword || !passwordHash) {
    return false;
  }

  return hashPassword(normalizedPassword) === passwordHash;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getCollaboratorAccessState(member: TeamMemberPublic): CollaboratorAccessState {
  const auth = member.auth;
  const hasPasswordHash = Boolean(auth?.passwordHash);
  const authEnabled = Boolean(auth?.authEnabled);
  const mustChangePassword = Boolean(auth?.mustChangePassword);

  if (!authEnabled) {
    return {
      hasSystemAccess: false,
      status: "Sin acceso al sistema",
      hasPasswordHash,
      authEnabled,
      mustChangePassword,
      passwordUpdatedAt: auth?.passwordUpdatedAt ?? null,
      lastLoginAt: auth?.lastLoginAt ?? null,
    };
  }

  if (!hasPasswordHash) {
    return {
      hasSystemAccess: true,
      status: "Sin contraseña temporal",
      hasPasswordHash,
      authEnabled,
      mustChangePassword,
      passwordUpdatedAt: auth?.passwordUpdatedAt ?? null,
      lastLoginAt: auth?.lastLoginAt ?? null,
    };
  }

  const status: CollaboratorAccessStatus = mustChangePassword || !auth?.passwordUpdatedAt
    ? "Pendiente de primer acceso"
    : "Acceso activo";

  return {
    hasSystemAccess: true,
    status,
    hasPasswordHash,
    authEnabled,
    mustChangePassword,
    passwordUpdatedAt: auth?.passwordUpdatedAt ?? null,
    lastLoginAt: auth?.lastLoginAt ?? null,
  };
}

function updateMemberAuth(memberId: number, updater: (current: TeamMemberPublic) => TeamMemberPublic): boolean {
  const members = loadMembers();
  let updated = false;

  const nextMembers = members.map((member) => {
    if (member.id !== memberId) {
      return member;
    }

    updated = true;
    return updater(member);
  });

  if (!updated) {
    return false;
  }

  persistMembers(nextMembers);
  return true;
}

export function getCurrentSession(): AuthSession | null {
  if (!canUseStorage()) {
    return null;
  }

  const stored = readStorage(AUTH_SESSION_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as AuthSession;
    if (!parsed?.collaboratorId || !parsed?.email || !parsed?.access) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

// Resolves the authenticated user from the real Supabase Auth session
// (client-side cached, see lib/supabase/client.ts) instead of the
// localStorage-based AuthSession. The Supabase user's email is matched
// against teamMembersPublic (institutionalEmail) the same way the
// localstorage path matches by collaboratorId, and access is resolved via
// the same resolveAccess() logic so permissions behave identically in both
// data-source modes.
function resolveSupabaseSessionAccess(): SessionAccessResolution {
  const supabaseUser = getCachedSupabaseUser();
  const email = supabaseUser?.email;
  if (!email) {
    return { status: "guest", user: null };
  }

  const normalizedEmail = normalizeEmail(email);
  const members = loadMembers();
  const roleByMemberId = loadSystemAccessMap();
  const member = members.find((item) => normalizeEmail(item.institutionalEmail || "") === normalizedEmail);

  if (!member) {
    return { status: "guest", user: null };
  }

  if (!member.active) {
    return { status: "inactive_member", user: null };
  }

  const access = resolveAccess(member, roleByMemberId);
  if (!access) {
    return { status: "no_system_access", user: null };
  }

  return {
    status: "active",
    user: { member, email: normalizedEmail, access },
  };
}

export function getCurrentAuthenticatedUser(): AuthenticatedUser | null {
  if (isSupabaseEnabled()) {
    return resolveSupabaseSessionAccess().user;
  }

  const session = getCurrentSession();
  if (!session) {
    return null;
  }

  const members = loadMembers();
  const roleByMemberId = loadSystemAccessMap();
  const member = members.find((item) => item.id === session.collaboratorId);

  if (!member || !member.active) {
    logout();
    return null;
  }

  const access = resolveAccess(member, roleByMemberId);
  if (!access) {
    logout();
    return null;
  }

  return {
    member,
    email: normalizeEmail(member.institutionalEmail || session.email),
    access,
  };
}

export function getCurrentAuthenticatedMember(): TeamMember | null {
  return getCurrentAuthenticatedUser()?.member ?? null;
}

export function resolveCurrentSessionAccess(): SessionAccessResolution {
  if (isSupabaseEnabled()) {
    return resolveSupabaseSessionAccess();
  }

  if (!canUseStorage()) {
    return { status: "guest", user: null };
  }

  const session = getCurrentSession();
  if (!session) {
    return { status: "guest", user: null };
  }

  const members = loadMembers();
  const roleByMemberId = loadSystemAccessMap();
  const member = members.find((item) => item.id === session.collaboratorId);

  if (!member) {
    logout();
    return { status: "guest", user: null };
  }

  if (!member.active) {
    logout();
    return { status: "inactive_member", user: null };
  }

  const access = resolveAccess(member, roleByMemberId);
  if (!access) {
    logout();
    return { status: "no_system_access", user: null };
  }

  const accessState = getCollaboratorAccessState(member);
  if (!accessState.hasSystemAccess) {
    logout();
    return { status: "no_system_access", user: null };
  }

  const user: AuthenticatedUser = {
    member,
    email: normalizeEmail(member.institutionalEmail || session.email),
    access,
  };

  if (accessState.status === "Pendiente de primer acceso") {
    return { status: "pending_first_access", user };
  }

  return { status: "active", user };
}

export function setCollaboratorPassword(collaboratorId: number, password: string): boolean {
  if (!canUseStorage()) {
    return false;
  }

  const trimmed = password.trim();
  if (!trimmed) {
    return false;
  }

  return updateMemberAuth(collaboratorId, (member) => ({
    ...member,
    auth: {
      passwordHash: hashPassword(trimmed),
      authEnabled: true,
      mustChangePassword: true,
      passwordUpdatedAt: null,
      lastLoginAt: member.auth?.lastLoginAt ?? null,
    },
  }));
}

export function loginWithEmailAndPassword(email: string, password: string): LoginResult {
  if (!canUseStorage()) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const normalizedEmail = normalizeEmail(email);
  const members = loadMembers();
  const roleByMemberId = loadSystemAccessMap();
  const member = members.find((item) => normalizeEmail(item.institutionalEmail || "") === normalizedEmail);

  if (!member) {
    return { ok: false, reason: "invalid_credentials" };
  }

  if (!member.active) {
    return { ok: false, reason: "inactive_member" };
  }

  const access = resolveAccess(member, roleByMemberId);
  if (!access) {
    return { ok: false, reason: "access_not_allowed" };
  }

  const auth = member.auth;
  if (!auth?.authEnabled) {
    return { ok: false, reason: "auth_disabled" };
  }

  if (!auth.passwordHash) {
    return { ok: false, reason: "password_not_set" };
  }

  const enteredPasswordHash = hashPassword(password);
  const canUseBootstrapPassword = normalizeEmail(member.institutionalEmail) === DEFAULT_ADMIN_MEMBER_EMAIL
    && auth.passwordUpdatedAt === null
    && enteredPasswordHash === DEFAULT_ADMIN_BOOTSTRAP_PASSWORD_HASH;

  if (!verifyPassword(password, auth.passwordHash) && !canUseBootstrapPassword) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const now = new Date().toISOString();
  const accessState = getCollaboratorAccessState(member);

  const session: AuthSession = {
    collaboratorId: member.id,
    email: normalizedEmail,
    access,
    loggedAt: now,
  };

  writeStorage(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));

  const nextMembers = members.map((item) => {
    if (item.id !== member.id) {
      return item;
    }

    return {
      ...item,
      auth: {
        passwordHash: normalizeEmail(item.institutionalEmail) === DEFAULT_ADMIN_MEMBER_EMAIL && item.auth?.passwordUpdatedAt === null
          ? DEFAULT_ADMIN_BOOTSTRAP_PASSWORD_HASH
          : item.auth?.passwordHash ?? "",
        authEnabled: item.auth?.authEnabled ?? true,
        mustChangePassword: item.auth?.mustChangePassword ?? false,
        passwordUpdatedAt: item.auth?.passwordUpdatedAt ?? null,
        lastLoginAt: now,
      },
    };
  });

  persistMembers(nextMembers);

  return { ok: true, session, requiresPasswordChange: accessState.status === "Pendiente de primer acceso" };
}

export function completeFirstAccessPasswordChange(newPassword: string, confirmation: string): PasswordChangeResult {
  const session = getCurrentSession();
  if (!session) {
    return { ok: false, reason: "no_session" };
  }

  const member = getCurrentAuthenticatedMember();
  if (!member) {
    return { ok: false, reason: "no_session" };
  }

  const accessState = getCollaboratorAccessState(member);
  if (!member.active) {
    return { ok: false, reason: "inactive_member" };
  }

  if (!accessState.hasSystemAccess) {
    return { ok: false, reason: "no_system_access" };
  }

  const normalizedPassword = newPassword.trim();
  if (normalizedPassword.length < 8) {
    return { ok: false, reason: "password_too_short" };
  }

  if (normalizedPassword !== confirmation.trim()) {
    return { ok: false, reason: "password_confirmation_mismatch" };
  }

  const updated = updateMemberAuth(member.id, (currentMember) => ({
    ...currentMember,
    auth: {
      passwordHash: hashPassword(normalizedPassword),
      authEnabled: true,
      mustChangePassword: false,
      passwordUpdatedAt: new Date().toISOString(),
      lastLoginAt: currentMember.auth?.lastLoginAt ?? session.loggedAt,
    },
  }));

  return updated ? { ok: true } : { ok: false, reason: "no_session" };
}

export function changeCurrentUserPassword(currentPassword: string, newPassword: string, confirmation: string): PasswordChangeResult {
  const session = getCurrentSession();
  if (!session) {
    return { ok: false, reason: "no_session" };
  }

  const member = getCurrentAuthenticatedMember();
  if (!member) {
    return { ok: false, reason: "no_session" };
  }

  if (!member.active) {
    return { ok: false, reason: "inactive_member" };
  }

  const accessState = getCollaboratorAccessState(member);
  if (!accessState.hasSystemAccess) {
    return { ok: false, reason: "no_system_access" };
  }

  const auth = member.auth;
  if (!auth?.passwordHash || !verifyPassword(currentPassword, auth.passwordHash)) {
    return { ok: false, reason: "invalid_current_password" };
  }

  const normalizedPassword = newPassword.trim();
  if (normalizedPassword.length < 8) {
    return { ok: false, reason: "password_too_short" };
  }

  if (normalizedPassword !== confirmation.trim()) {
    return { ok: false, reason: "password_confirmation_mismatch" };
  }

  const updated = updateMemberAuth(member.id, (currentMember) => ({
    ...currentMember,
    auth: {
      passwordHash: hashPassword(normalizedPassword),
      authEnabled: true,
      mustChangePassword: false,
      passwordUpdatedAt: new Date().toISOString(),
      lastLoginAt: currentMember.auth?.lastLoginAt ?? session.loggedAt,
    },
  }));

  return updated ? { ok: true } : { ok: false, reason: "no_session" };
}

export function logout(): void {
  if (isSupabaseEnabled()) {
    // Fire-and-forget: signOutFromSupabase() clears the cached Supabase user
    // synchronously before awaiting the network sign-out call, so callers
    // that call logout() synchronously (e.g. a header button's onClick) see
    // the logged-out state immediately.
    void signOutFromSupabase();
    return;
  }

  if (!canUseStorage()) {
    return;
  }

  removeStorage(AUTH_SESSION_STORAGE_KEY);
}

export function setCollaboratorSystemAccess(collaboratorId: number, enabled: boolean): boolean {
  if (!canUseStorage()) {
    return false;
  }

  return updateMemberAuth(collaboratorId, (member) => {
    if (!member.auth && !enabled) {
      return member;
    }

    return {
      ...member,
      auth: member.auth
        ? {
            ...member.auth,
            authEnabled: enabled,
          }
        : enabled
          ? {
              passwordHash: "",
              authEnabled: true,
              mustChangePassword: true,
              passwordUpdatedAt: null,
              lastLoginAt: null,
            }
          : undefined,
    };
  });
}

export function setCollaboratorActiveStatus(collaboratorId: number, active: boolean): boolean {
  if (!canUseStorage()) {
    return false;
  }

  return updateMemberAuth(collaboratorId, (member) => ({
    ...member,
    active,
    availability: active && member.availability === "No disponible"
      ? "Disponible"
      : !active
        ? "No disponible"
        : member.availability,
  }));
}

export function setCollaboratorTemporaryPassword(collaboratorId: number, password: string): boolean {
  if (!canUseStorage()) {
    return false;
  }

  const trimmed = password.trim();
  if (!trimmed) {
    return false;
  }

  return updateMemberAuth(collaboratorId, (member) => ({
    ...member,
    auth: {
      passwordHash: hashPassword(trimmed),
      authEnabled: true,
      mustChangePassword: true,
      passwordUpdatedAt: null,
      lastLoginAt: member.auth?.lastLoginAt ?? null,
    },
  }));
}
