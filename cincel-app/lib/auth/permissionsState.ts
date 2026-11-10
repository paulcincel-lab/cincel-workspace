import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { isPermissionLocked, type PermissionOverrides } from "@/lib/auth/permissions";
import {
  PERMISSIONS_MODULES_REGISTRY,
  type PermissionActionDefinition,
  type PermissionValue,
} from "@/lib/auth/permissionsRegistry";
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
      const moduleCandidate = roleCandidate[moduleDefinition.id] ?? {};
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

// ── Server-stored matrix (#971) ─────────────────────────────────────────────

/** One saved cell of `core.role_permissions`: a value that differs from the role's default. */
export type RolePermissionRow = { role: SystemAccessRole; moduleId: string; key: string; value: PermissionValue };

export type PermissionOverridesByRole = Partial<Record<SystemAccessRole, PermissionOverrides>>;

/** The matrix the server enforces: the overrides per role, the defaults merged with them, and whether any exist. */
export type PermissionsMatrix = {
  overrides: PermissionOverridesByRole;
  permissions: PermissionsState;
  hasCustom: boolean;
};

let defaultsMemo: PermissionsState | null = null;

/** `buildDefaultPermissionsState()` computed once; the defaults are constants. Treat it as read only. */
export function defaultPermissionsState(): PermissionsState {
  defaultsMemo ??= buildDefaultPermissionsState();
  return defaultsMemo;
}

function isValidValue(action: PermissionActionDefinition, value: unknown): value is PermissionValue {
  if (action.type === "boolean") return typeof value === "boolean";
  return typeof value === "string" && (action.options ?? []).some((option) => option.value === value);
}

const ROLE_SET: ReadonlySet<string> = new Set(SYSTEM_ACCESS_ROLES);

/** The first cell of an edited matrix with a known capability but a value it doesn't accept, or null. */
export function findInvalidPermissionCell(
  state: Partial<Record<string, Record<string, Record<string, unknown>>>>,
): string | null {
  for (const [role, roleState] of Object.entries(state)) {
    for (const [moduleId, values] of Object.entries(roleState ?? {})) {
      const moduleDefinition = PERMISSIONS_MODULES_REGISTRY.find((candidate) => candidate.id === moduleId);
      for (const [key, value] of Object.entries(values ?? {})) {
        const action = moduleDefinition?.actions.find((candidate) => candidate.id === key);
        if (action && !isValidValue(action, value)) return `${role}.${moduleId}.${key}`;
      }
    }
  }
  return null;
}

/**
 * The cells worth storing: known role, module and key, a valid value, not
 * locked (`isPermissionLocked`) and different from the default. Anything else
 * is dropped, so stale rows (a removed capability) never apply.
 */
export function storableRows(rows: Iterable<{ role: string; moduleId: string; key: string; value: unknown }>): RolePermissionRow[] {
  const defaults = defaultPermissionsState();
  const out: RolePermissionRow[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!ROLE_SET.has(row.role)) continue;
    const role = row.role as SystemAccessRole;
    const moduleDefinition = PERMISSIONS_MODULES_REGISTRY.find((candidate) => candidate.id === row.moduleId);
    const action = moduleDefinition?.actions.find((candidate) => candidate.id === row.key);
    if (!moduleDefinition || !action) continue;
    if (isPermissionLocked(role, row.moduleId, row.key)) continue;
    if (!isValidValue(action, row.value)) continue;
    if (defaults[role]?.[row.moduleId]?.[row.key] === row.value) continue;
    const id = `${role}\u0000${row.moduleId}\u0000${row.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ role, moduleId: row.moduleId, key: row.key, value: row.value });
  }
  return out;
}

/** The storable cells of a full matrix as edited on Ajustes › Permisos. */
export function rowsFromPermissionsState(state: Partial<Record<string, Record<string, Record<string, unknown>>>>): RolePermissionRow[] {
  const candidates: Array<{ role: string; moduleId: string; key: string; value: unknown }> = [];
  for (const role of SYSTEM_ACCESS_ROLES) {
    const roleState = state[role];
    if (!roleState) continue;
    for (const [moduleId, values] of Object.entries(roleState)) {
      for (const [key, value] of Object.entries(values ?? {})) candidates.push({ role, moduleId, key, value });
    }
  }
  return storableRows(candidates);
}

/** Saved rows → the matrix the server enforces. */
export function buildPermissionsMatrix(
  rows: Iterable<{ role: string; moduleId: string; key: string; value: unknown }>,
): PermissionsMatrix {
  const defaults = defaultPermissionsState();
  const stored = storableRows(rows);
  const overrides: Record<string, Record<string, Record<string, PermissionValue>>> = {};
  for (const row of stored) {
    const roleOverrides = (overrides[row.role] ??= {});
    (roleOverrides[row.moduleId] ??= {})[row.key] = row.value;
  }

  const permissions = {} as PermissionsState;
  for (const role of SYSTEM_ACCESS_ROLES) {
    const roleOverrides = overrides[role];
    if (!roleOverrides) {
      permissions[role] = defaults[role];
      continue;
    }
    const roleState: RolePermissionsState = {};
    for (const [moduleId, values] of Object.entries(defaults[role])) {
      roleState[moduleId] = roleOverrides[moduleId] ? { ...values, ...roleOverrides[moduleId] } : values;
    }
    permissions[role] = roleState;
  }

  return { overrides: overrides as PermissionOverridesByRole, permissions, hasCustom: stored.length > 0 };
}

/** "Dirección · Proyectos › Eliminar proyecto: Sí → No", one line per changed cell, for the audit log. */
export function describePermissionChanges(before: PermissionsState, after: PermissionsState): string[] {
  const lines: string[] = [];
  const show = (action: PermissionActionDefinition, value: PermissionValue | undefined) => {
    if (action.type === "boolean") return value === true ? "Sí" : "No";
    return action.options?.find((option) => option.value === value)?.label ?? String(value ?? "");
  };
  for (const role of SYSTEM_ACCESS_ROLES) {
    for (const moduleDefinition of PERMISSIONS_MODULES_REGISTRY) {
      for (const action of moduleDefinition.actions) {
        const a = before[role]?.[moduleDefinition.id]?.[action.id];
        const b = after[role]?.[moduleDefinition.id]?.[action.id];
        if (a === b) continue;
        lines.push(`${role} · ${moduleDefinition.name} › ${action.label}: ${show(action, a)} → ${show(action, b)}`);
      }
    }
  }
  return lines;
}
