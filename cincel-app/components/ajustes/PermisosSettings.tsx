"use client";

import { useEffect, useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { Badge } from "@/components/ui/shadcn/badge";
import { PERMISSIONS_CUSTOM_STORAGE_KEY } from "@/lib/auth/permissions";
import { getEnabledModuleNames, splitModuleBadges } from "@/lib/auth/permissionsState";
import { SYSTEM_ACCESS_ROLES, SYSTEM_ADMIN_ROLE, type SystemAccessRole } from "@/lib/data/roles";
import { ajustesPermisosOptions } from "@/lib/query/options/ajustes";
import { removeStorage } from "@/lib/repositories/browser-state-repository";
import type { PermisosStaffRow } from "@/lib/types/ajustes-catalogs";

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

const PEOPLE_SHOWN = 3;

/** "Ana, Luis y Sofía" / "Ana, Luis, Sofía y 2 más" / "Sin personas con este acceso". */
export function peopleSummary(people: readonly { name: string }[]): string {
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

/** Enabled module names of a role as short text: "Módulos: Proyectos, Equipo +3". */
function modulesSummary(modules: string[]): string {
  if (modules.length === 0) return "Sin módulos activos";
  const { visible, hiddenCount } = splitModuleBadges(modules);
  return `Módulos: ${visible.join(", ")}${hiddenCount > 0 ? ` +${hiddenCount}` : ""}`;
}

/** People grouped by the access the server resolved for them (`PermisosStaffRow.access`). */
function groupByAccess(staff: readonly PermisosStaffRow[]): Record<SystemAccessRole, PermisosStaffRow[]> {
  const out = Object.fromEntries(SYSTEM_ACCESS_ROLES.map((role) => [role, [] as PermisosStaffRow[]])) as Record<
    SystemAccessRole,
    PermisosStaffRow[]
  >;
  for (const person of staff) out[person.access]?.push(person);
  return out;
}

/**
 * Ajustes › Permisos (redesign FE §3.8, #950): a read-only summary of the
 * people per access and the modules each access has with the default
 * permissions, which are the ones the server enforces. Reads
 * `qk.ajustes.page('permisos')`, hydrated by the page; no refetch on focus.
 *
 * The old per-role editor saved its matrix only in this browser and enforced
 * nothing, so it is gone until the matrix lives on the server (#971). The
 * value it left in the browser is removed once, on mount.
 */
export function PermisosSettings() {
  const { staff, defaultPermissions } = useSuspenseQuery(ajustesPermisosOptions()).data;
  const byAccess = useMemo(() => groupByAccess(staff), [staff]);

  useEffect(() => {
    try {
      removeStorage(PERMISSIONS_CUSTOM_STORAGE_KEY);
    } catch {
      // Storage can be blocked (private mode); there is nothing to remove then.
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Permisos</h2>
          <Badge variant="secondary">Admin</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Cada rol usa los permisos por defecto del sistema. Aquí ves quién tiene cada acceso y qué módulos incluye.
        </p>
      </div>

      <SettingsSection
        title="Personas por acceso"
        description="Cada persona toma el acceso de su rol. Los permisos de cada acceso son los permisos por defecto."
      >
        {SYSTEM_ACCESS_ROLES.map((role) => {
          const people = byAccess[role] ?? [];
          const modules = getEnabledModuleNames(defaultPermissions[role] ?? {});
          return (
            <SettingsRow
              key={role}
              label={role}
              description={`${ACCESS_DESCRIPTIONS[role]} ${peopleSummary(people)}. ${modulesSummary(modules)}.`}
              control={
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{peopleCount(people.length)}</Badge>
                  {role === SYSTEM_ADMIN_ROLE ? <Badge variant="secondary">Acceso completo</Badge> : null}
                </div>
              }
            />
          );
        })}
      </SettingsSection>
    </div>
  );
}
