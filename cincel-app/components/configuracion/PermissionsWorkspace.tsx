"use client";

import { memo, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
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
  splitModuleBadges,
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
import {
  readStorage,
  writeStorage,
  removeStorage,
} from "@/lib/repositories/browser-state-repository";
import type { Staff } from "@/lib/types/core";

type AccessSummary = {
  role: SystemAccessRole;
  description: string;
  usersCount: number;
  enabledModules: string[];
  protectedRole: boolean;
};

type PermissionChange = {
  role: SystemAccessRole;
  moduleId: string;
  actionId: string;
  nextValue: PermissionValue;
};

const ACCESS_DESCRIPTIONS: Record<SystemAccessRole, string> = {
  Administrador: "Control total del ERP y configuración protegida del sistema.",
  Dirección: "Gestión estratégica con administración avanzada de módulos.",
  "Jefe de Taller":
    "Coordinación operativa de diseño y seguimiento de proyectos.",
  "Jefe de Construcción": "Supervisión de obra y coordinación de ejecución.",
  "Arquitecto Senior":
    "Ejecución experta con alcance transversal en proyectos.",
  "Arquitecto Junior": "Ejecución y colaboración dentro de flujos asignados.",
  Colaborador: "Apoyo operativo con alcance delimitado por asignación.",
  "Pasante / Servicio Social":
    "Participación asistida con alcance de consulta y apoyo.",
  Otros: "Acceso restringido para casos especiales de colaboración.",
};

/** Select `items` maps, built once per action instead of on every render of the editor. */
const SELECT_ITEMS_BY_ACTION = new Map<string, Record<string, string>>(
  PERMISSIONS_MODULES_REGISTRY.flatMap((moduleDefinition) =>
    moduleDefinition.actions
      .filter((action) => action.type === "select")
      .map((action) => [
        `${moduleDefinition.id}-${action.id}`,
        Object.fromEntries((action.options ?? []).map((o) => [o.value, o.label])),
      ] as const),
  ),
);

const EMPTY_MODULE_STATE: ModulePermissionsState = {};

/** Access role mirrors the server resolution in `lib/auth/session.ts`: it comes
 * straight from `staff.role`, not a separate client-side override. */
function resolveMemberAccess(member: Staff): SystemAccessRole {
  if (
    isAdministratorRole(member.role) ||
    hasDefaultSystemAdministratorAccess(member.email)
  ) {
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

function getModuleDetails(
  moduleDefinition: PermissionsModuleDefinition,
  moduleState: ModulePermissionsState,
): string | null {
  if (!moduleDefinition.detailsLabel || !moduleDefinition.detailsValueLabel) {
    return null;
  }

  return `${moduleDefinition.detailsLabel}: ${moduleDefinition.detailsValueLabel(moduleState)}`;
}

function ModuleBadges({ role, modules }: { role: SystemAccessRole; modules: string[] }) {
  const { visible, hiddenCount } = splitModuleBadges(modules);

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((module) => (
        <Badge key={`${role}-${module}`} variant="outline">
          {module}
        </Badge>
      ))}
      {hiddenCount > 0 ? (
        <Badge variant="secondary" title={modules.slice(visible.length).join(", ")}>
          +{hiddenCount}
        </Badge>
      ) : null}
    </div>
  );
}

function buildAccessColumns(
  setSelectedAccess: (role: SystemAccessRole) => void,
): ColumnDef<AccessSummary, unknown>[] {
  return [
    {
      accessorKey: "role",
      header: "Acceso",
      cell: ({ row }) => (
        <span className="font-semibold text-foreground">
          {row.original.role}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "Descripción",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.description}
        </span>
      ),
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
      cell: ({ row }) => <ModuleBadges role={row.original.role} modules={row.original.enabledModules} />,
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
            title={
              row.original.protectedRole
                ? "Administrador mantiene acceso completo y no puede editarse."
                : "Abrir editor de permisos"
            }
          >
            Configurar
          </Button>
        </div>
      ),
    },
  ];
}

interface ModulePermissionsCardProps {
  moduleDefinition: PermissionsModuleDefinition;
  moduleState: ModulePermissionsState;
  role: SystemAccessRole;
  canEdit: boolean;
  onChange: (change: PermissionChange) => void;
}

/** One module of the editor. Memoized so a toggle re-renders only the module it touches, not every Select/Switch. */
const ModulePermissionsCard = memo(function ModulePermissionsCard({
  moduleDefinition,
  moduleState,
  role,
  canEdit,
  onChange,
}: ModulePermissionsCardProps) {
  const moduleDetails = getModuleDetails(moduleDefinition, moduleState);

  return (
    <article className="rounded-xl border border-border bg-muted p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            {moduleDefinition.name}
          </h3>
          {moduleDetails ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {moduleDetails}
            </p>
          ) : null}
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
          {moduleDefinition.actions.length} acciones
        </span>
      </div>

      <div className="space-y-2">
        {moduleDefinition.actions.map((action) => {
          const value = moduleState[action.id];
          const controlId = `${moduleDefinition.id}-${action.id}`;

          if (action.type === "select") {
            return (
              <div
                key={controlId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <label className="text-sm text-foreground" htmlFor={controlId}>
                  {action.label}
                </label>
                <Select
                  items={SELECT_ITEMS_BY_ACTION.get(controlId) ?? {}}
                  value={String(value)}
                  disabled={!canEdit}
                  onValueChange={(nextValue) =>
                    onChange({
                      role,
                      moduleId: moduleDefinition.id,
                      actionId: action.id,
                      nextValue: nextValue as string,
                    })
                  }
                >
                  <SelectTrigger id={controlId} className="h-auto px-2 py-1 text-xs">
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
              key={controlId}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 ${canEdit ? "cursor-pointer hover:bg-muted" : "cursor-not-allowed"}`}
            >
              <p className={`text-sm ${canEdit ? "text-foreground" : "text-muted-foreground"}`}>
                {action.label}
              </p>
              <Switch
                checked={Boolean(value)}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  onChange({
                    role,
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
});

interface PermissionsWorkspaceProps {
  initialStaff: Staff[];
  /** Default permission matrix, computed on the server so hydration doesn't run every resolver for every role. */
  defaultPermissions: PermissionsState;
}

export default function PermissionsWorkspace({
  initialStaff,
  defaultPermissions,
}: PermissionsWorkspaceProps) {
  const [members, setMembers] = useState<Staff[]>(initialStaff);
  const [selectedAccess, setSelectedAccess] =
    useState<SystemAccessRole>("Dirección");
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

  const usersByAccess = useMemo(() => {
    const initial = Object.fromEntries(
      SYSTEM_ACCESS_ROLES.map((role) => [role, 0]),
    ) as Record<SystemAccessRole, number>;

    for (const member of members) {
      const access = resolveMemberAccess(member);
      initial[access] += 1;
    }

    return initial;
  }, [members]);

  const accessSummary = useMemo<AccessSummary[]>(() => {
    return SYSTEM_ACCESS_ROLES.map((role) => ({
      role,
      description: ACCESS_DESCRIPTIONS[role],
      usersCount: usersByAccess[role] ?? 0,
      enabledModules: getEnabledModuleNames(permissionsState[role] ?? {}),
      protectedRole: role === SYSTEM_ADMIN_ROLE,
    }));
  }, [permissionsState, usersByAccess]);

  const accessColumns = useMemo(
    () => buildAccessColumns(setSelectedAccess),
    [],
  );

  const selectedRoleInfo =
    accessSummary.find((access) => access.role === selectedAccess) ??
    accessSummary[0];
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

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />

      <section className="flex-1 overflow-y-auto p-10">
        <Header />

        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-8 shadow-sm">
            <h1 className="text-3xl font-bold text-foreground">Permisos</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Administra los accesos y capacidades del sistema.
            </p>
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
                <h2 className="text-xl font-semibold text-foreground">
                  Editor de permisos
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Configuración activa para el acceso:{" "}
                  <span className="font-semibold text-foreground">
                    {selectedRoleInfo?.role}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Fuente actual:{" "}
                  {hasCustomConfig
                    ? "Configuración personalizada"
                    : "Valores por defecto de permissions.ts"}
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
              {PERMISSIONS_MODULES_REGISTRY.map((moduleDefinition) => (
                <ModulePermissionsCard
                  key={moduleDefinition.id}
                  moduleDefinition={moduleDefinition}
                  moduleState={selectedRoleState[moduleDefinition.id] ?? EMPTY_MODULE_STATE}
                  role={selectedAccess}
                  canEdit={canEditSelectedRole}
                  onChange={updatePermissionValue}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
