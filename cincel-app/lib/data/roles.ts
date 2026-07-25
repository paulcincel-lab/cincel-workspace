export const OFFICIAL_CINCEL_ROLES = [
  "Administrador",
  "Dirección",
  "Jefe de Taller",
  "Jefe de Construcción",
  "Arquitecto Senior",
  "Arquitecto Junior",
  "Colaborador",
  "Pasante / Servicio Social",
  "Otros",
] as const;

export type OfficialCincelRole = (typeof OFFICIAL_CINCEL_ROLES)[number];
type LegacyBlockedAccessRole = "Cliente";

export const SYSTEM_ADMIN_ROLE = "Administrador" as const;
export const DEFAULT_SYSTEM_ACCESS_ROLE: OfficialCincelRole = "Colaborador";
export const SYSTEM_ACCESS_ROLES = OFFICIAL_CINCEL_ROLES;
export const SYSTEM_ADMIN_MEMBER_EMAILS = ["paul@cincel.mx"] as const;

export type SystemAccessRole = (typeof SYSTEM_ACCESS_ROLES)[number];

export const ROLE_PERMISSIONS_TEMPLATE: Record<OfficialCincelRole, string[]> = {
  Administrador: [],
  "Dirección": [],
  "Jefe de Taller": [],
  "Jefe de Construcción": [],
  "Arquitecto Senior": [],
  "Arquitecto Junior": [],
  Colaborador: [],
  "Pasante / Servicio Social": [],
  Otros: [],
};

const LEGACY_BLOCKED_ACCESS_ROLES: readonly LegacyBlockedAccessRole[] = ["Cliente"];

const LEGACY_ACCESS_ROLE_ALIASES: Readonly<Record<string, SystemAccessRole>> = {
  "responsable de proyecto": "Jefe de Taller",
  usuario: DEFAULT_SYSTEM_ACCESS_ROLE,
};

export function isAdministratorRole(role: string | null | undefined): boolean {
  return role?.trim().toLowerCase() === SYSTEM_ADMIN_ROLE.toLowerCase();
}

export function hasDefaultSystemAdministratorAccess(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return SYSTEM_ADMIN_MEMBER_EMAILS.includes(normalized as (typeof SYSTEM_ADMIN_MEMBER_EMAILS)[number]);
}

export function isOfficialCincelRole(role: string | null | undefined): role is OfficialCincelRole {
  if (!role) {
    return false;
  }

  return OFFICIAL_CINCEL_ROLES.includes(role.trim() as OfficialCincelRole);
}

export function isLegacyBlockedAccessRole(role: string | null | undefined): role is LegacyBlockedAccessRole {
  if (!role) {
    return false;
  }

  const normalized = role.trim().toLowerCase();
  return LEGACY_BLOCKED_ACCESS_ROLES.some((blockedRole) => blockedRole.toLowerCase() === normalized);
}

export function normalizeSystemAccessRole(role: string | null | undefined): SystemAccessRole | null {
  const normalized = role?.trim();

  if (!normalized) {
    return null;
  }

  const normalizedLower = normalized.toLowerCase();

  if (isLegacyBlockedAccessRole(normalized)) {
    return null;
  }

  const aliasedRole = LEGACY_ACCESS_ROLE_ALIASES[normalizedLower];
  if (aliasedRole) {
    return aliasedRole;
  }

  return isOfficialCincelRole(normalized) ? normalized : null;
}
