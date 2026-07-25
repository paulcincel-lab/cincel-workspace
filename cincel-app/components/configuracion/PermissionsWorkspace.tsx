"use client";

import { useEffect, useMemo, useState } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { PERMISSIONS_CUSTOM_STORAGE_KEY } from "@/lib/auth/permissions";
import {
  PERMISSIONS_MODULES_REGISTRY,
  type PermissionValue,
  type PermissionsModuleDefinition,
} from "@/lib/auth/permissionsRegistry";
import {
  DEFAULT_SYSTEM_ACCESS_ROLE,
  hasDefaultSystemAdministratorAccess,
  isAdministratorRole,
  normalizeSystemAccessRole,
  SYSTEM_ACCESS_ROLES,
  SYSTEM_ADMIN_ROLE,
  type SystemAccessRole,
} from "@/lib/data/roles";
import { teamMembers, type TeamMember } from "@/lib/data/team";

const TEAM_MEMBERS_STORAGE_KEY = "cincel.team.members.v1";
const SYSTEM_ROLE_STORAGE_KEY = "cincel.team.system-roles.v1";

type AccessSummary = {
  role: SystemAccessRole;
  description: string;
  usersCount: number;
  enabledModules: string[];
  protectedRole: boolean;
};

type ModulePermissionsState = Record<string, PermissionValue>;
type RolePermissionsState = Record<string, ModulePermissionsState>;
type PermissionsState = Record<SystemAccessRole, RolePermissionsState>;

type StoredPermissionsState = {
  version: 1;
  roles: PermissionsState;
};

const CONFIG_NAV_ITEMS: Array<{ key: string; label: string; enabled: boolean }> = [
  { key: "permisos", label: "Permisos", enabled: true },
  { key: "general", label: "General", enabled: false },
  { key: "catalogos", label: "Catalogos", enabled: false },
  { key: "seguridad", label: "Seguridad", enabled: false },
  { key: "integraciones", label: "Integraciones", enabled: false },
  { key: "api-webhooks", label: "API / Webhooks", enabled: false },
  { key: "notificaciones", label: "Notificaciones", enabled: false },
];

const ACCESS_DESCRIPTIONS: Record<SystemAccessRole, string> = {
  Administrador: "Control total del ERP y configuración protegida del sistema.",
  "Dirección": "Gestion estratégica con administración avanzada de módulos.",
  "Jefe de Taller": "Coordinación operativa de diseño y seguimiento de proyectos.",
  "Jefe de Construcción": "Supervisión de obra y coordinación de ejecución.",
  "Arquitecto Senior": "Ejecución experta con alcance transversal en proyectos.",
  "Arquitecto Junior": "Ejecución y colaboración dentro de flujos asignados.",
  Colaborador: "Apoyo operativo con alcance delimitado por asignación.",
  "Pasante / Servicio Social": "Participación asistida con alcance de consulta y apoyo.",
  Otros: "Acceso restringido para casos especiales de colaboración.",
};

function loadTeamMembers(): TeamMember[] {
  if (typeof window === "undefined") {
    return teamMembers;
  }

  const stored = localStorage.getItem(TEAM_MEMBERS_STORAGE_KEY);
  if (!stored) {
    return teamMembers;
  }

  try {
    const parsed = JSON.parse(stored) as TeamMember[];
    return Array.isArray(parsed) ? parsed : teamMembers;
  } catch {
    return teamMembers;
  }
}

function loadSystemRoleMap(): Record<number, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = localStorage.getItem(SYSTEM_ROLE_STORAGE_KEY);
  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored) as Record<number, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function resolveMemberAccess(member: TeamMember, roleMap: Record<number, string>): SystemAccessRole {
  const configuredRaw = roleMap[member.id];
  const configured = normalizeSystemAccessRole(configuredRaw);

  if (configured) {
    return configured;
  }

  if (isAdministratorRole(member.role) || hasDefaultSystemAdministratorAccess(member.institutionalEmail)) {
    return SYSTEM_ADMIN_ROLE;
  }

  return DEFAULT_SYSTEM_ACCESS_ROLE;
}

function toMockUser(access: SystemAccessRole): AuthenticatedUser {
  return {
    member: teamMembers[0],
    email: "configuracion@cincel.mx",
    access,
  };
}

function toggleClasses(enabled: boolean): string {
  if (enabled) {
    return "bg-emerald-500 border-emerald-500";
  }

  return "bg-slate-300 border-slate-300";
}

function buildDefaultPermissionsState(): PermissionsState {
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

function sanitizePermissionsState(defaultState: PermissionsState, storedState: unknown): PermissionsState {
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

function loadPermissionsState(defaultState: PermissionsState): { state: PermissionsState; hasCustom: boolean } {
  if (typeof window === "undefined") {
    return { state: defaultState, hasCustom: false };
  }

  const stored = localStorage.getItem(PERMISSIONS_CUSTOM_STORAGE_KEY);
  if (!stored) {
    return { state: defaultState, hasCustom: false };
  }

  try {
    const parsed = JSON.parse(stored);
    return {
      state: sanitizePermissionsState(defaultState, parsed),
      hasCustom: true,
    };
  } catch {
    return { state: defaultState, hasCustom: false };
  }
}

function savePermissionsState(state: PermissionsState): void {
  const payload: StoredPermissionsState = {
    version: 1,
    roles: state,
  };

  localStorage.setItem(PERMISSIONS_CUSTOM_STORAGE_KEY, JSON.stringify(payload));
}

function getModuleDetails(moduleDefinition: PermissionsModuleDefinition, moduleState: ModulePermissionsState): string | null {
  if (!moduleDefinition.detailsLabel || !moduleDefinition.detailsValueLabel) {
    return null;
  }

  return `${moduleDefinition.detailsLabel}: ${moduleDefinition.detailsValueLabel(moduleState)}`;
}

export default function PermissionsWorkspace() {
  const defaultPermissionsState = useMemo(() => buildDefaultPermissionsState(), []);
  const loadedPermissions = useMemo(() => loadPermissionsState(defaultPermissionsState), [defaultPermissionsState]);

  const [members, setMembers] = useState<TeamMember[]>(() => loadTeamMembers());
  const [systemRoleMap, setSystemRoleMap] = useState<Record<number, string>>(() => loadSystemRoleMap());
  const [selectedAccess, setSelectedAccess] = useState<SystemAccessRole>("Dirección");
  const [permissionsState, setPermissionsState] = useState<PermissionsState>(loadedPermissions.state);
  const [hasCustomConfig, setHasCustomConfig] = useState<boolean>(loadedPermissions.hasCustom);

  useEffect(() => {
    const refresh = () => {
      setMembers(loadTeamMembers());
      setSystemRoleMap(loadSystemRoleMap());

      const loaded = loadPermissionsState(defaultPermissionsState);
      setPermissionsState(loaded.state);
      setHasCustomConfig(loaded.hasCustom);
    };

    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [defaultPermissionsState]);

  const usersByAccess = useMemo(() => {
    const initial = Object.fromEntries(SYSTEM_ACCESS_ROLES.map((role) => [role, 0])) as Record<SystemAccessRole, number>;

    for (const member of members) {
      const access = resolveMemberAccess(member, systemRoleMap);
      initial[access] += 1;
    }

    return initial;
  }, [members, systemRoleMap]);

  const accessSummary = useMemo<AccessSummary[]>(() => {
    return SYSTEM_ACCESS_ROLES.map((role) => {
      const roleState = permissionsState[role] ?? {};
      const enabledModules = PERMISSIONS_MODULES_REGISTRY
        .filter((moduleDefinition) => moduleDefinition.isEnabled(roleState[moduleDefinition.id] ?? {}))
        .map((moduleDefinition) => moduleDefinition.name);

      return {
        role,
        description: ACCESS_DESCRIPTIONS[role],
        usersCount: usersByAccess[role] ?? 0,
        enabledModules,
        protectedRole: role === SYSTEM_ADMIN_ROLE,
      };
    });
  }, [permissionsState, usersByAccess]);

  const selectedRoleInfo = accessSummary.find((access) => access.role === selectedAccess) ?? accessSummary[0];
  const selectedRoleState = permissionsState[selectedAccess] ?? {};

  const isDirty = useMemo(() => {
    return JSON.stringify(permissionsState) !== JSON.stringify(defaultPermissionsState);
  }, [defaultPermissionsState, permissionsState]);

  const canEditSelectedRole = selectedAccess !== SYSTEM_ADMIN_ROLE;

  const updatePermissionValue = ({
    role,
    moduleId,
    actionId,
    nextValue,
  }: {
    role: SystemAccessRole;
    moduleId: string;
    actionId: string;
    nextValue: PermissionValue;
  }) => {
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
  };

  const saveChanges = () => {
    savePermissionsState(permissionsState);
    setHasCustomConfig(true);
  };

  const restoreDefaults = () => {
    localStorage.removeItem(PERMISSIONS_CUSTOM_STORAGE_KEY);
    setPermissionsState(defaultPermissionsState);
    setHasCustomConfig(false);
  };

  return (
    <main className="flex min-h-screen bg-slate-100">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
          <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Configuracion</h2>
            <nav className="mt-4 space-y-1.5">
              {CONFIG_NAV_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  disabled={!item.enabled}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${item.enabled ? "bg-blue-50 text-blue-700" : "cursor-not-allowed text-slate-400"}`}
                >
                  {item.label}
                  {!item.enabled ? <span className="ml-2 text-xs text-slate-400">Proximamente</span> : null}
                </button>
              ))}
            </nav>
          </aside>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h1 className="text-3xl font-bold text-slate-900">Permisos</h1>
              <p className="mt-2 text-sm text-slate-600">Administra los accesos y capacidades del sistema.</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-[960px] w-full text-sm text-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-3">Acceso</th>
                      <th className="px-3 py-3">Descripcion</th>
                      <th className="px-3 py-3">Usuarios</th>
                      <th className="px-3 py-3">Modulos</th>
                      <th className="px-3 py-3">Estado</th>
                      <th className="px-3 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessSummary.map((access) => (
                      <tr key={access.role} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-4 font-semibold text-slate-900">{access.role}</td>
                        <td className="px-3 py-4 text-slate-600">{access.description}</td>
                        <td className="px-3 py-4">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {access.usersCount}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {access.enabledModules.map((module) => (
                              <span key={`${access.role}-${module}`} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                                {module}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          {access.protectedRole ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">Protegido</span>
                          ) : (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Editable</span>
                          )}
                        </td>
                        <td className="px-3 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setSelectedAccess(access.role)}
                            disabled={access.protectedRole}
                            title={access.protectedRole ? "Administrador mantiene acceso completo y no puede editarse." : "Abrir editor de permisos"}
                            className={`rounded-lg px-3 py-2 text-xs font-semibold ${access.protectedRole ? "cursor-not-allowed bg-slate-200 text-slate-400" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                          >
                            Configurar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Editor de permisos</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Configuración activa para el acceso: <span className="font-semibold text-slate-800">{selectedRoleInfo?.role}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Fuente actual: {hasCustomConfig ? "Configuración personalizada" : "Valores por defecto de permissions.ts"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={restoreDefaults}
                    disabled={!hasCustomConfig}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold ${hasCustomConfig ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
                  >
                    Restaurar permisos por defecto
                  </button>
                  <button
                    type="button"
                    onClick={saveChanges}
                    disabled={!isDirty || !canEditSelectedRole}
                    className={`rounded-lg px-3 py-2 text-xs font-semibold text-white ${!isDirty || !canEditSelectedRole ? "cursor-not-allowed bg-slate-300" : "bg-blue-600 hover:bg-blue-700"}`}
                  >
                    Guardar cambios
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {PERMISSIONS_MODULES_REGISTRY.map((moduleDefinition) => {
                  const moduleState = selectedRoleState[moduleDefinition.id] ?? {};
                  const moduleDetails = getModuleDetails(moduleDefinition, moduleState);

                  return (
                    <article key={moduleDefinition.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold tracking-tight text-slate-900">{moduleDefinition.name}</h3>
                          {moduleDetails ? (
                            <p className="mt-1 text-xs text-slate-500">{moduleDetails}</p>
                          ) : null}
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                          {moduleDefinition.actions.length} acciones
                        </span>
                      </div>

                      <div className="space-y-2">
                        {moduleDefinition.actions.map((action) => {
                          const value = moduleState[action.id];

                          if (action.type === "select") {
                            return (
                              <div key={`${moduleDefinition.id}-${action.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                <label className="text-sm text-slate-700" htmlFor={`${moduleDefinition.id}-${action.id}`}>
                                  {action.label}
                                </label>
                                <select
                                  id={`${moduleDefinition.id}-${action.id}`}
                                  value={String(value)}
                                  disabled={!canEditSelectedRole}
                                  onChange={(event) =>
                                    updatePermissionValue({
                                      role: selectedAccess,
                                      moduleId: moduleDefinition.id,
                                      actionId: action.id,
                                      nextValue: event.target.value,
                                    })
                                  }
                                  className={`rounded-md border px-2 py-1 text-xs font-medium ${canEditSelectedRole ? "border-slate-300 bg-white text-slate-700" : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"}`}
                                >
                                  {(action.options ?? []).map((option) => (
                                    <option key={`${action.id}-${option.value}`} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          }

                          return (
                            <button
                              key={`${moduleDefinition.id}-${action.id}`}
                              type="button"
                              disabled={!canEditSelectedRole}
                              onClick={() =>
                                updatePermissionValue({
                                  role: selectedAccess,
                                  moduleId: moduleDefinition.id,
                                  actionId: action.id,
                                  nextValue: !Boolean(value),
                                })
                              }
                              className={`flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left ${canEditSelectedRole ? "hover:bg-slate-50" : "cursor-not-allowed"}`}
                            >
                              <p className={`text-sm ${canEditSelectedRole ? "text-slate-700" : "text-slate-400"}`}>{action.label}</p>
                              <span className={`inline-flex h-6 w-11 items-center rounded-full border px-0.5 ${toggleClasses(Boolean(value))}`}>
                                <span className={`h-4 w-4 rounded-full bg-white transition ${Boolean(value) ? "translate-x-5" : "translate-x-0"}`} />
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
