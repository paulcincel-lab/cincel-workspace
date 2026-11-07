"use client";

import { memo } from "react";

import {
  EMPTY_MODULE_STATE,
  SELECT_ITEMS_BY_ACTION,
  getModuleDetails,
  usePermissionsWorkspace,
  type PermissionChange,
} from "@/components/configuracion/usePermissionsWorkspace";
import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Switch } from "@/components/ui/shadcn/switch";
import {
  PERMISSIONS_MODULES_REGISTRY,
  type PermissionsModuleDefinition,
} from "@/lib/auth/permissionsRegistry";
import { splitModuleBadges, type ModulePermissionsState, type PermissionsState } from "@/lib/auth/permissionsState";
import type { SystemAccessRole } from "@/lib/data/roles";
import type { Staff } from "@/lib/types/core";

const PEOPLE_SHOWN = 3;

/** "Ana, Luis y Sofía" / "Ana, Luis, Sofía y 2 más" / "Sin personas con este acceso". */
export function peopleSummary(people: readonly Staff[]): string {
  if (people.length === 0) return "Sin personas con este acceso";
  const names = people.slice(0, PEOPLE_SHOWN).map((person) => person.name);
  const rest = people.length - names.length;
  if (rest > 0) return `${names.join(", ")} y ${rest} más`;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function peopleCount(n: number): string {
  return n === 1 ? "1 persona" : `${n} personas`;
}

/** Enabled module names of a role as short text: "Proyectos, Equipo +3". */
function modulesSummary(modules: string[]): string {
  if (modules.length === 0) return "Sin módulos activos";
  const { visible, hiddenCount } = splitModuleBadges(modules);
  return `Módulos: ${visible.join(", ")}${hiddenCount > 0 ? ` +${hiddenCount}` : ""}`;
}

type ModuleSectionProps = {
  moduleDefinition: PermissionsModuleDefinition;
  moduleState: ModulePermissionsState;
  role: SystemAccessRole;
  canEdit: boolean;
  onChange: (change: PermissionChange) => void;
};

/** One module of the editor. Memoized so a toggle re-renders only the module it touches. */
const ModuleSection = memo(function ModuleSection({
  moduleDefinition,
  moduleState,
  role,
  canEdit,
  onChange,
}: ModuleSectionProps) {
  const details = getModuleDetails(moduleDefinition, moduleState);
  const count = moduleDefinition.actions.length;

  return (
    <SettingsSection
      title={moduleDefinition.name}
      description={details ?? `${count} ${count === 1 ? "acción" : "acciones"}`}
    >
      {moduleDefinition.actions.map((action) => {
        const value = moduleState[action.id];
        const controlId = `ajustes-permiso-${moduleDefinition.id}-${action.id}`;
        const itemsKey = `${moduleDefinition.id}-${action.id}`;

        if (action.type === "select") {
          return (
            <SettingsRow
              key={controlId}
              label={action.label}
              htmlFor={controlId}
              control={
                <Select
                  items={SELECT_ITEMS_BY_ACTION.get(itemsKey) ?? {}}
                  value={String(value)}
                  disabled={!canEdit}
                  onValueChange={(nextValue) =>
                    onChange({ role, moduleId: moduleDefinition.id, actionId: action.id, nextValue: nextValue as string })
                  }
                >
                  <SelectTrigger id={controlId}>
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
              }
            />
          );
        }

        return (
          <SettingsRow
            key={controlId}
            label={action.label}
            htmlFor={controlId}
            control={
              <Switch
                id={controlId}
                checked={Boolean(value)}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  onChange({ role, moduleId: moduleDefinition.id, actionId: action.id, nextValue: checked })
                }
              />
            }
          />
        );
      })}
    </SettingsSection>
  );
});

export type PermisosSettingsProps = {
  initialStaff: Staff[];
  /** Default permission matrix, computed on the server. */
  defaultPermissions: PermissionsState;
};

/**
 * Ajustes › Permisos (redesign FE §3.8, frame `AjustesPermisos`): accesses with
 * their people, then the selected access's permissions per module, on
 * `SettingsSection` / `SettingsRow`. Storage is unchanged (the same browser
 * key as the legacy Configuración › Permisos page, through the shared hook).
 */
export function PermisosSettings({ initialStaff, defaultPermissions }: PermisosSettingsProps) {
  const {
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
  } = usePermissionsWorkspace({ initialStaff, defaultPermissions });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Permisos</h2>
          <Badge variant="secondary">Admin</Badge>
        </div>
        <p className="text-sm text-muted-foreground">Administra los accesos y capacidades del sistema.</p>
      </div>

      <SettingsSection
        title="Personas por acceso"
        description="Cada persona toma el acceso de su rol. Elige un acceso para configurar sus permisos."
      >
        {accessSummary.map((access) => {
          const selected = access.role === selectedAccess;
          return (
            <SettingsRow
              key={access.role}
              label={access.role}
              description={`${access.description} ${peopleSummary(membersByAccess[access.role] ?? [])}. ${modulesSummary(access.enabledModules)}.`}
              control={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{peopleCount(access.usersCount)}</Badge>
                  {access.protectedRole ? (
                    <Badge variant="secondary">Protegido</Badge>
                  ) : (
                    <Badge variant="outline">Editable</Badge>
                  )}
                  <Button
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    aria-pressed={selected}
                    aria-label={`Configurar ${access.role}`}
                    disabled={access.protectedRole}
                    title={
                      access.protectedRole
                        ? "Administrador mantiene acceso completo y no puede editarse."
                        : "Abrir editor de permisos"
                    }
                    onClick={() => setSelectedAccess(access.role)}
                  >
                    Configurar
                  </Button>
                </div>
              }
            />
          );
        })}
      </SettingsSection>

      <SettingsSection
        title={`Permisos de ${selectedRoleInfo?.role ?? selectedAccess}`}
        description={`Fuente actual: ${hasCustomConfig ? "configuración personalizada" : "valores por defecto"}.`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={restoreDefaults} disabled={!hasCustomConfig}>
              Restaurar permisos por defecto
            </Button>
            <Button size="sm" onClick={saveChanges} disabled={!isDirty || !canEditSelectedRole}>
              Guardar cambios
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Los cambios se guardan en este navegador y aplican al acceso {selectedRoleInfo?.role ?? selectedAccess}.
        </p>
      </SettingsSection>

      {PERMISSIONS_MODULES_REGISTRY.map((moduleDefinition) => (
        <ModuleSection
          key={moduleDefinition.id}
          moduleDefinition={moduleDefinition}
          moduleState={selectedRoleState[moduleDefinition.id] ?? EMPTY_MODULE_STATE}
          role={selectedAccess}
          canEdit={canEditSelectedRole}
          onChange={updatePermissionValue}
        />
      ))}
    </div>
  );
}
