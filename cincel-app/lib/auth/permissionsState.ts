import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { mapLegacyModuleState } from "@/lib/auth/permissions";
import { PERMISSIONS_MODULES_REGISTRY, type PermissionValue } from "@/lib/auth/permissionsRegistry";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";
import { teamMembersPublic } from "@/lib/data/team-public";

/**
 * Pure helpers behind Configuración → Permisos. They hold no browser state, so the page can build the default matrix
 * on the server and hand it to the client as plain data instead of running every resolver for every role on hydrate.
 */

export type ModulePermissionsState = Record<string, PermissionValue>;
export type RolePermissionsState = Record<string, ModulePermissionsState>;
export type PermissionsState = Record<SystemAccessRole, RolePermissionsState>;

export type StoredPermissionsState = {
  version: 1;
  roles: PermissionsState;
};

/** How many module badges a role row shows before collapsing the rest into a "+N" badge. */
export const VISIBLE_MODULE_BADGES = 4;

function toMockUser(access: SystemAccessRole): AuthenticatedUser {
  return {
    member: teamMembersPublic[0],
    email: "configuracion@cincel.mx",
    access,
  };
}

export function buildDefaultPermissionsState(): PermissionsState {
  const next = {} as PermissionsState;

  for (const role of SYSTEM_ACCESS_ROLES) {
    const roleState: RolePermissionsState = {};
    const user = toMockUser(role);

    for (const moduleDefinition of PERMISSIONS_MODULES_REGISTRY) {
      const capabilities = moduleDefinition.resolver(user);
      const moduleState: ModulePermissionsState = {};

      for (const action of moduleDefinition.actions) {
        moduleState[action.id] = action.getValue(capabilities);
      }

      roleState[moduleDefinition.id] = moduleState;
    }

    next[role] = roleState;
  }

  return next;
}

export function sanitizePermissionsState(defaultState: PermissionsState, storedState: unknown): PermissionsState {
  if (!storedState || typeof storedState !== "object") {
    return defaultState;
  }

  const candidate = storedState as StoredPermissionsState;
  if (candidate.version !== 1 || !candidate.roles || typeof candidate.roles !== "object") {
    return defaultState;
  }

  const merged = {} as PermissionsState;

  for (const role of SYSTEM_ACCESS_ROLES) {
    const roleDefaults = defaultState[role];
    const roleCandidate = candidate.roles[role] ?? {};
    const roleNext: RolePermissionsState = {};

    for (const moduleDefinition of PERMISSIONS_MODULES_REGISTRY) {
      const moduleDefaults = roleDefaults[moduleDefinition.id] ?? {};
      const moduleCandidate =
        roleCandidate[moduleDefinition.id] ??
        mapLegacyModuleState(roleCandidate as Record<string, unknown>, moduleDefinition.id) ??
        {};
      const moduleNext: ModulePermissionsState = {};

      for (const action of moduleDefinition.actions) {
        const defaultValue = moduleDefaults[action.id];
        const rawValue = moduleCandidate[action.id];

        if (action.type === "boolean") {
          moduleNext[action.id] = typeof rawValue === "boolean" ? rawValue : defaultValue;
          continue;
        }

        const validOption = action.options?.some((option) => option.value === rawValue);
        moduleNext[action.id] = validOption && typeof rawValue === "string" ? rawValue : defaultValue;
      }

      roleNext[moduleDefinition.id] = moduleNext;
    }

    merged[role] = roleNext;
  }

  return merged;
}

/** Parses the raw stored value; anything missing or unreadable falls back to the defaults. */
export function parseStoredPermissionsState(
  raw: string | null,
  defaultState: PermissionsState,
): { state: PermissionsState; hasCustom: boolean } {
  if (!raw) {
    return { state: defaultState, hasCustom: false };
  }

  try {
    return { state: sanitizePermissionsState(defaultState, JSON.parse(raw)), hasCustom: true };
  } catch {
    return { state: defaultState, hasCustom: false };
  }
}

export function getEnabledModuleNames(roleState: RolePermissionsState): string[] {
  return PERMISSIONS_MODULES_REGISTRY.filter((moduleDefinition) =>
    moduleDefinition.isEnabled(roleState[moduleDefinition.id] ?? {}),
  ).map((moduleDefinition) => moduleDefinition.name);
}

/** Splits a role's module names into the badges shown inline and the count folded into "+N". */
export function splitModuleBadges(
  modules: string[],
  max: number = VISIBLE_MODULE_BADGES,
): { visible: string[]; hiddenCount: number } {
  const limit = Math.max(0, max);
  return { visible: modules.slice(0, limit), hiddenCount: Math.max(0, modules.length - limit) };
}

/** Stable structural comparison of two permission matrices, cheaper than serializing both on every render. */
export function permissionsStatesEqual(a: PermissionsState, b: PermissionsState): boolean {
  for (const role of SYSTEM_ACCESS_ROLES) {
    const roleA = a[role] ?? {};
    const roleB = b[role] ?? {};
    if (roleA === roleB) continue;

    for (const moduleDefinition of PERMISSIONS_MODULES_REGISTRY) {
      const moduleA = roleA[moduleDefinition.id] ?? {};
      const moduleB = roleB[moduleDefinition.id] ?? {};
      if (moduleA === moduleB) continue;

      for (const action of moduleDefinition.actions) {
        if (moduleA[action.id] !== moduleB[action.id]) return false;
      }
    }
  }

  return true;
}
