"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import { PERMISSIONS_CUSTOM_STORAGE_KEY } from "@/lib/auth/permissions";
import {
  PERMISSIONS_MODULES_REGISTRY,
  type PermissionValue,
  type PermissionsModuleDefinition,
} from "@/lib/auth/permissionsRegistry";
import {
  getEnabledModuleNames,
  parseStoredPermissionsState,
  permissionsStatesEqual,
  type ModulePermissionsState,
  type PermissionsState,
  type StoredPermissionsState,
} from "@/lib/auth/permissionsState";
import {
  DEFAULT_SYSTEM_ACCESS_ROLE,
  hasDefaultSystemAdministratorAccess,
  isAdministratorRole,
  normalizeSystemAccessRole,
  SYSTEM_ACCESS_ROLES,
  SYSTEM_ADMIN_ROLE,
  type SystemAccessRole,
} from "@/lib/data/roles";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";
import type { Staff } from "@/lib/types/core";

export type AccessSummary = {
  role: SystemAccessRole;
  description: string;
  usersCount: number;
  enabledModules: string[];
  protectedRole: boolean;
};

export type PermissionChange = {
  role: SystemAccessRole;
  moduleId: string;
  actionId: string;
  nextValue: PermissionValue;
};

export const ACCESS_DESCRIPTIONS: Record<SystemAccessRole, string> = {
  Administrador: "Control total del ERP y configuración protegida del sistema.",
  Dirección: "Gestión estratégica con administración avanzada de módulos.",
  "Jefe de Taller": "Coordinación operativa de diseño y seguimiento de proyectos.",
  "Jefe de Construcción": "Supervisión de obra y coordinación de ejecución.",
  "Arquitecto Senior": "Ejecución experta con alcance transversal en proyectos.",
  "Arquitecto Junior": "Ejecución y colaboración dentro de flujos asignados.",
  Colaborador: "Apoyo operativo con alcance delimitado por asignación.",
  "Pasante / Servicio Social": "Participación asistida con alcance de consulta y apoyo.",
  Otros: "Acceso restringido para casos especiales de colaboración.",
};

/** Select `items` maps, built once per action instead of on every render of the editor. */
export const SELECT_ITEMS_BY_ACTION = new Map<string, Record<string, string>>(
  PERMISSIONS_MODULES_REGISTRY.flatMap((moduleDefinition) =>
    moduleDefinition.actions
      .filter((action) => action.type === "select")
      .map(
        (action) =>
          [
            `${moduleDefinition.id}-${action.id}`,
            Object.fromEntries((action.options ?? []).map((o) => [o.value, o.label])),
          ] as const,
      ),
  ),
);

export const EMPTY_MODULE_STATE: ModulePermissionsState = {};

/** Access role mirrors the server resolution in `lib/auth/session.ts`: it comes
 * straight from `staff.role`, not a separate client-side override. */
export function resolveMemberAccess(member: Staff): SystemAccessRole {
  if (isAdministratorRole(member.role) || hasDefaultSystemAdministratorAccess(member.email)) {
    return SYSTEM_ADMIN_ROLE;
  }

  return normalizeSystemAccessRole(member.role) ?? DEFAULT_SYSTEM_ACCESS_ROLE;
}

function loadPermissionsState(defaultState: PermissionsState): {
  state: PermissionsState;
  hasCustom: boolean;
} {
  if (typeof window === "undefined") {
    return { state: defaultState, hasCustom: false };
  }

  return parseStoredPermissionsState(readStorage(PERMISSIONS_CUSTOM_STORAGE_KEY), defaultState);
}

function savePermissionsState(state: PermissionsState): void {
  const payload: StoredPermissionsState = {
    version: 1,
    roles: state,
  };

  writeStorage(PERMISSIONS_CUSTOM_STORAGE_KEY, JSON.stringify(payload));
}

export function getModuleDetails(
  moduleDefinition: PermissionsModuleDefinition,
  moduleState: ModulePermissionsState,
): string | null {
  if (!moduleDefinition.detailsLabel || !moduleDefinition.detailsValueLabel) {
    return null;
  }

  return `${moduleDefinition.detailsLabel}: ${moduleDefinition.detailsValueLabel(moduleState)}`;
}

export type PermissionsWorkspaceInput = {
  initialStaff: Staff[];
  /** Default permission matrix, computed on the server so hydration doesn't run every resolver for every role. */
  defaultPermissions: PermissionsState;
};

/**
 * State of the permissions editor, shared by the legacy Configuración ›
 * Permisos page (`PermissionsWorkspace`) and Ajustes › Permisos
 * (`PermisosSettings`). Storage is unchanged: the custom matrix lives in the
 * browser under `PERMISSIONS_CUSTOM_STORAGE_KEY`.
 */
export function usePermissionsWorkspace({ initialStaff, defaultPermissions }: PermissionsWorkspaceInput) {
  const [members, setMembers] = useState<Staff[]>(initialStaff);
  const [selectedAccess, setSelectedAccess] = useState<SystemAccessRole>("Dirección");
  // Start from the server defaults so the first client render matches the server HTML; stored overrides are applied
  // after mount, which avoids a hydration mismatch forcing a full client re-render.
  const [permissionsState, setPermissionsState] = useState<PermissionsState>(defaultPermissions);
  const [hasCustomConfig, setHasCustomConfig] = useState<boolean>(false);

  useEffect(() => {
    const applyStored = () => {
      const loaded = loadPermissionsState(defaultPermissions);
      startTransition(() => {
        setPermissionsState(loaded.state);
        setHasCustomConfig(loaded.hasCustom);
      });
    };

    const refresh = () => {
      applyStored();

      void fetchStaffAction({ includeInactive: true })
        .then((rows) => {
          if (rows.length > 0) startTransition(() => setMembers(rows));
        })
        .catch(() => undefined);
    };

    // The server already sent the staff list; only fetch it on mount when it couldn't.
    if (initialStaff.length > 0) applyStored();
    else refresh();

    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialStaff only decides the first fetch
  }, [defaultPermissions]);

  const membersByAccess = useMemo(() => {
    const initial = Object.fromEntries(SYSTEM_ACCESS_ROLES.map((role) => [role, [] as Staff[]])) as Record<
      SystemAccessRole,
      Staff[]
    >;

    for (const member of members) {
      initial[resolveMemberAccess(member)].push(member);
    }

    return initial;
  }, [members]);

  const accessSummary = useMemo<AccessSummary[]>(() => {
    return SYSTEM_ACCESS_ROLES.map((role) => ({
      role,
      description: ACCESS_DESCRIPTIONS[role],
      usersCount: membersByAccess[role]?.length ?? 0,
      enabledModules: getEnabledModuleNames(permissionsState[role] ?? {}),
      protectedRole: role === SYSTEM_ADMIN_ROLE,
    }));
  }, [permissionsState, membersByAccess]);

  const selectedRoleInfo = accessSummary.find((access) => access.role === selectedAccess) ?? accessSummary[0];
  const selectedRoleState = permissionsState[selectedAccess] ?? {};

  const isDirty = useMemo(
    () => !permissionsStatesEqual(permissionsState, defaultPermissions),
    [defaultPermissions, permissionsState],
  );

  const canEditSelectedRole = selectedAccess !== SYSTEM_ADMIN_ROLE;

  const updatePermissionValue = useCallback(({ role, moduleId, actionId, nextValue }: PermissionChange) => {
    if (role === SYSTEM_ADMIN_ROLE) {
      return;
    }

    setPermissionsState((current) => ({
      ...current,
      [role]: {
        ...current[role],
        [moduleId]: {
          ...current[role][moduleId],
          [actionId]: nextValue,
        },
      },
    }));
  }, []);

  const saveChanges = () => {
    savePermissionsState(permissionsState);
    setHasCustomConfig(true);
  };

  const restoreDefaults = () => {
    removeStorage(PERMISSIONS_CUSTOM_STORAGE_KEY);
    setPermissionsState(defaultPermissions);
    setHasCustomConfig(false);
  };

  return {
    membersByAccess,
    accessSummary,
    selectedAccess,
    setSelectedAccess,
    selectedRoleInfo,
    selectedRoleState,
    hasCustomConfig,
    isDirty,
    canEditSelectedRole,
    updatePermissionValue,
    saveChanges,
    restoreDefaults,
  };
}
