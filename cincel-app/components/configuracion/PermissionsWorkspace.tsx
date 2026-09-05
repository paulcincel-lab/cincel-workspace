"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
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
import { teamMembersPublic, type TeamMemberPublic as TeamMember } from "@/lib/data/team-public";
import { fetchTeamMembersPublic } from "@/lib/repositories/team-repository";
import { readStorage, writeStorage, removeStorage } from "@/lib/repositories/browser-state-repository";

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

const CONFIG_NAV_ITEMS: Array<{ key: string; label: string; href?: string; enabled: boolean }> = [
  { key: "permisos", label: "Permisos", href: "/configuracion/permisos", enabled: true },
  { key: "general", label: "General", href: "/configuracion/general", enabled: true },
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

/** Pre-hydration seed — real roster comes from `fetchTeamMembersPublic()`. */
function loadTeamMembers(): TeamMember[] {
  return teamMembersPublic;
}

function loadSystemRoleMap(): Record<number, string> {
  if (typeof window === "undefined") {
    return {};
  }

  const stored = readStorage(SYSTEM_ROLE_STORAGE_KEY);
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
    member: teamMembersPublic[0],
    email: "configuracion@cincel.mx",
    access,
  };
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

  const stored = readStorage(PERMISSIONS_CUSTOM_STORAGE_KEY);
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

  writeStorage(PERMISSIONS_CUSTOM_STORAGE_KEY, JSON.stringify(payload));
}

function getModuleDetails(moduleDefinition: PermissionsModuleDefinition, moduleState: ModulePermissionsState): string | null {
  if (!moduleDefinition.detailsLabel || !moduleDefinition.detailsValueLabel) {
    return null;
  }

  return `${moduleDefinition.detailsLabel}: ${moduleDefinition.detailsValueLabel(moduleState)}`;
}

function buildAccessColumns(setSelectedAccess: (role: SystemAccessRole) => void): ColumnDef<AccessSummary, unknown>[] {
  return [
    {
      accessorKey: "role",
      header: "Acceso",
      cell: ({ row }) => <span className="font-semibold text-foreground">{row.original.role}</span>,
    },
    {
      accessorKey: "description",
      header: "Descripcion",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.description}</span>,
    },
    {
      accessorKey: "usersCount",
      header: "Usuarios",
      cell: ({ row }) => (
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
          {row.original.usersCount}
        </span>
      ),
    },
    {
      id: "modules",
      header: "Modulos",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1.5">
          {row.original.enabledModules.map((module) => (
            <span key={`${row.original.role}-${module}`} className="rounded-full border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
              {module}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: "Estado",
      accessorFn: (access) => access.protectedRole,
      cell: ({ row }) =>
        row.original.protectedRole ? (
          <Badge variant="secondary">Protegido</Badge>
        ) : (
          <Badge variant="outline">Editable</Badge>
        ),
    },
    {
      id: "actions",
      header: () => <span className="block text-right">Acciones</span>,
      enableSorting: false,
      cell: ({ row }) => (
        <div className="text-right">
          <Button
            size="sm"
            className="h-auto px-3 py-2 text-xs"
            onClick={() => setSelectedAccess(row.original.role)}
            disabled={row.original.protectedRole}
            title={row.original.protectedRole ? "Administrador mantiene acceso completo y no puede editarse." : "Abrir editor de permisos"}
          >
            Configurar
          </Button>
        </div>
      ),
    },
  ];
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
      setSystemRoleMap(loadSystemRoleMap());

      const loaded = loadPermissionsState(defaultPermissionsState);
      setPermissionsState(loaded.state);
      setHasCustomConfig(loaded.hasCustom);

      void fetchTeamMembersPublic()
        .then((rows) => {
          if (rows.length > 0) setMembers(rows);
        })
        .catch(() => undefined);
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

  const accessColumns = useMemo(() => buildAccessColumns(setSelectedAccess), []);

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
    removeStorage(PERMISSIONS_CUSTOM_STORAGE_KEY);
    setPermissionsState(defaultPermissionsState);
    setHasCustomConfig(false);
  };

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="grid gap-6 xl:grid-cols-[260px_1fr]">
          <aside className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Configuracion</h2>
            <nav className="mt-4 space-y-1.5">
              {CONFIG_NAV_ITEMS.map((item) => {
                const isActive = item.key === "permisos";

                if (item.enabled && item.href) {
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    >
                      {item.label}
                    </Link>
                  );
                }

                return (
                  <Button
                    key={item.key}
                    variant="ghost"
                    disabled
                    className="h-auto w-full justify-start px-3 py-2 text-left text-sm font-medium"
                  >
                    {item.label}
                    <span className="ml-2 text-xs text-muted-foreground">Proximamente</span>
                  </Button>
                );
              })}
            </nav>
          </aside>

          <div className="space-y-6">
            <section className="rounded-2xl border border-border bg-card p-8 shadow-sm">
              <h1 className="text-3xl font-bold text-foreground">Permisos</h1>
              <p className="mt-2 text-sm text-muted-foreground">Administra los accesos y capacidades del sistema.</p>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <DataTable
                columns={accessColumns}
                data={accessSummary}
                getRowId={(access) => access.role}
                tableClassName="min-w-[960px]"
              />
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-xl font-semibold text-foreground">Editor de permisos</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Configuración activa para el acceso: <span className="font-semibold text-foreground">{selectedRoleInfo?.role}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fuente actual: {hasCustomConfig ? "Configuración personalizada" : "Valores por defecto de permissions.ts"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-auto px-3 py-2 text-xs"
                    onClick={restoreDefaults}
                    disabled={!hasCustomConfig}
                  >
                    Restaurar permisos por defecto
                  </Button>
                  <Button
                    size="sm"
                    className="h-auto px-3 py-2 text-xs"
                    onClick={saveChanges}
                    disabled={!isDirty || !canEditSelectedRole}
                  >
                    Guardar cambios
                  </Button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                {PERMISSIONS_MODULES_REGISTRY.map((moduleDefinition) => {
                  const moduleState = selectedRoleState[moduleDefinition.id] ?? {};
                  const moduleDetails = getModuleDetails(moduleDefinition, moduleState);

                  return (
                    <article key={moduleDefinition.id} className="rounded-xl border border-border bg-muted p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold tracking-tight text-foreground">{moduleDefinition.name}</h3>
                          {moduleDetails ? (
                            <p className="mt-1 text-xs text-muted-foreground">{moduleDetails}</p>
                          ) : null}
                        </div>
                        <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                          {moduleDefinition.actions.length} acciones
                        </span>
                      </div>

                      <div className="space-y-2">
                        {moduleDefinition.actions.map((action) => {
                          const value = moduleState[action.id];

                          if (action.type === "select") {
                            return (
                              <div key={`${moduleDefinition.id}-${action.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2">
                                <label className="text-sm text-foreground" htmlFor={`${moduleDefinition.id}-${action.id}`}>
                                  {action.label}
                                </label>
                                <Select
                                  value={String(value)}
                                  disabled={!canEditSelectedRole}
                                  onValueChange={(nextValue) =>
                                    updatePermissionValue({
                                      role: selectedAccess,
                                      moduleId: moduleDefinition.id,
                                      actionId: action.id,
                                      nextValue: nextValue as string,
                                    })
                                  }
                                >
                                  <SelectTrigger id={`${moduleDefinition.id}-${action.id}`} className="h-auto px-2 py-1 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(action.options ?? []).map((option) => (
                                      <SelectItem key={`${action.id}-${option.value}`} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            );
                          }

                          return (
                            <label
                              key={`${moduleDefinition.id}-${action.id}`}
                              className={`flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 ${canEditSelectedRole ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed"}`}
                            >
                              <p className={`text-sm ${canEditSelectedRole ? "text-foreground" : "text-muted-foreground"}`}>{action.label}</p>
                              <Switch
                                checked={Boolean(value)}
                                disabled={!canEditSelectedRole}
                                onCheckedChange={(checked) =>
                                  updatePermissionValue({
                                    role: selectedAccess,
                                    moduleId: moduleDefinition.id,
                                    actionId: action.id,
                                    nextValue: checked,
                                  })
                                }
                              />
                            </label>
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
