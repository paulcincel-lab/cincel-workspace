"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronDownIcon, EyeIcon } from "lucide-react";

import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { PERMISSIONS_CUSTOM_STORAGE_KEY } from "@/lib/auth/permissions";
import {
  PERMISSIONS_MODULES_REGISTRY,
  type PermissionActionDefinition,
  type PermissionValue,
} from "@/lib/auth/permissionsRegistry";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";
import { ajustesPermisosOptions } from "@/lib/query/options/ajustes";
import { removeStorage } from "@/lib/repositories/browser-state-repository";
import type { PermisosStaffRow } from "@/lib/types/ajustes-catalogs";
import { cn } from "@/lib/utils";

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

/** People grouped by the access the server resolved for them (`PermisosStaffRow.access`). */
function groupByAccess(staff: readonly PermisosStaffRow[]): Record<SystemAccessRole, PermisosStaffRow[]> {
  const out = Object.fromEntries(SYSTEM_ACCESS_ROLES.map((role) => [role, [] as PermisosStaffRow[]])) as Record<
    SystemAccessRole,
    PermisosStaffRow[]
  >;
  for (const person of staff) out[person.access]?.push(person);
  return out;
}

/** A capability that only shows something ("Ver …"): granted reads as "Solo ver". */
export function isViewCapability(actionId: string): boolean {
  const last = actionId.split(".").pop() ?? actionId;
  return /^canView/.test(last) || /^show/.test(last);
}

export type PermissionCell = { kind: "can" } | { kind: "view" } | { kind: "none" } | { kind: "scope"; label: string };

/** How one capability of one access reads in the matrix. */
export function permissionCell(action: PermissionActionDefinition, value: PermissionValue | undefined): PermissionCell {
  if (action.type === "select") {
    const label = action.options?.find((option) => option.value === value)?.label ?? (typeof value === "string" ? value : "");
    return label ? { kind: "scope", label } : { kind: "none" };
  }
  if (value !== true) return { kind: "none" };
  return isViewCapability(action.id) ? { kind: "view" } : { kind: "can" };
}

/** A module's summary for one access: Puede when any non-view capability is on, Solo ver when only views are. */
export function moduleSummary(
  actions: readonly PermissionActionDefinition[],
  values: Record<string, PermissionValue> | undefined,
): PermissionCell {
  const cells = actions.map((action) => permissionCell(action, values?.[action.id]));
  if (cells.some((cell) => cell.kind === "can")) return { kind: "can" };
  if (cells.some((cell) => cell.kind === "view")) return { kind: "view" };
  return { kind: "none" };
}

function CanMark() {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
      <CheckIcon aria-hidden="true" className="size-3" />
    </span>
  );
}

function ViewMark() {
  return (
    <span className="inline-flex size-5 items-center justify-center rounded-full border border-primary text-primary">
      <EyeIcon aria-hidden="true" className="size-3" />
    </span>
  );
}

function ScopePill({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="max-w-[160px] truncate">
      {label}
    </Badge>
  );
}

function Cell({ cell }: { cell: PermissionCell }) {
  if (cell.kind === "can") {
    return (
      <>
        <CanMark />
        <span className="sr-only">Puede</span>
      </>
    );
  }
  if (cell.kind === "view") {
    return (
      <>
        <ViewMark />
        <span className="sr-only">Solo ver</span>
      </>
    );
  }
  if (cell.kind === "scope") return <ScopePill label={cell.label} />;
  return (
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        —
      </span>
      <span className="sr-only">Sin acceso</span>
    </>
  );
}

const MODULES = [...PERMISSIONS_MODULES_REGISTRY].sort((a, b) => a.order - b.order);

function capabilitiesLabel(n: number): string {
  return n === 1 ? "1 capacidad" : `${n} capacidades`;
}

/**
 * Ajustes › Permisos (redesign FE §3.8, #950, frame `Ajustes-Permisos`): the
 * target permission matrix, read only. It shows the default permissions,
 * which are the ones the server enforces today; editing waits for the server
 * model (#971). Reads `qk.ajustes.page('permisos')`, hydrated by the page.
 *
 * The old per-role editor saved its matrix only in this browser and enforced
 * nothing; the value it left in the browser is removed once, on mount.
 */
export function PermisosSettings() {
  const { staff, defaultPermissions } = useSuspenseQuery(ajustesPermisosOptions()).data;
  const byAccess = useMemo(() => groupByAccess(staff), [staff]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    try {
      removeStorage(PERMISSIONS_CUSTOM_STORAGE_KEY);
    } catch {
      // Storage can be blocked (private mode); there is nothing to remove then.
    }
  }, []);

  function toggle(moduleId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="note" className="rounded-[14px] border border-warning/30 bg-warning/10 px-4 py-3 text-[13px] text-foreground">
        <strong className="font-semibold">Próximamente: permisos aplicados en el servidor.</strong> Esta matriz es el
        diseño objetivo y se mantiene oculta en la app hasta que exista el modelo en el servidor (#950, #971). Hoy el
        acceso de cada persona lo define su cuenta.
      </div>

      <section
        aria-labelledby="permisos-por-acceso"
        className="flex min-w-0 flex-col gap-4 rounded-[14px] border border-border bg-card p-5 text-card-foreground shadow-xs"
      >
        <div className="flex flex-col gap-1">
          <h2 id="permisos-por-acceso" className="text-[15px] font-semibold text-foreground">
            Permisos por acceso
          </h2>
          <p className="text-[13px] text-muted-foreground">Qué puede ver y hacer cada nivel de acceso en cada módulo.</p>
        </div>

        <ul aria-label="Leyenda" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <CanMark /> Puede
          </li>
          <li className="flex items-center gap-1.5">
            <ViewMark /> Solo ver
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true">—</span> Sin acceso
          </li>
          <li className="flex items-center gap-1.5">
            <ScopePill label="Alcance" /> Opción elegida
          </li>
        </ul>

        <div className="min-w-0 overflow-x-auto rounded-[10px] border border-border">
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <caption className="sr-only">Permisos por acceso</caption>
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th scope="col" className="px-3 py-2 font-medium text-muted-foreground">
                  Módulo · capacidad
                </th>
                {SYSTEM_ACCESS_ROLES.map((role) => (
                  <th key={role} scope="col" className="px-2 py-2 text-center font-medium text-foreground">
                    <span title={ACCESS_DESCRIPTIONS[role]}>{role}</span>
                  </th>
                ))}
              </tr>
              <tr className="border-b border-border">
                <th scope="row" className="px-3 py-2 text-left font-normal text-muted-foreground">
                  Personas por acceso
                </th>
                {SYSTEM_ACCESS_ROLES.map((role) => {
                  const people = byAccess[role] ?? [];
                  return (
                    <td key={role} className="px-2 py-2 text-center font-mono tabular-nums" title={peopleSummary(people)}>
                      {people.length}
                    </td>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((module) => {
                const open = expanded.has(module.id);
                const rowsId = `permisos-${module.id}`;
                return (
                  <Fragment key={module.id}>
                    <tr className="border-b border-border">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-controls={open ? rowsId : undefined}
                          onClick={() => toggle(module.id)}
                          className="flex items-center gap-2 rounded-md text-left font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ChevronDownIcon
                            aria-hidden="true"
                            className={cn("size-4 text-muted-foreground transition-transform", open ? null : "-rotate-90")}
                          />
                          {module.name}
                          <span className="font-mono text-[11px] font-normal text-muted-foreground">
                            {capabilitiesLabel(module.actions.length)}
                          </span>
                        </button>
                      </th>
                      {SYSTEM_ACCESS_ROLES.map((role) => (
                        <td key={role} className="px-2 py-2 text-center">
                          <span className="inline-flex justify-center">
                            <Cell cell={moduleSummary(module.actions, defaultPermissions[role]?.[module.id])} />
                          </span>
                        </td>
                      ))}
                    </tr>
                    {open
                      ? module.actions.map((action, index) => (
                          <tr key={action.id} id={index === 0 ? rowsId : undefined} className="border-b border-border bg-muted/30">
                            <th scope="row" className="py-2 pr-3 pl-9 text-left font-normal text-foreground">
                              {action.label}
                            </th>
                            {SYSTEM_ACCESS_ROLES.map((role) => (
                              <td key={role} className="px-2 py-2 text-center">
                                <span className="inline-flex justify-center">
                                  <Cell cell={permissionCell(action, defaultPermissions[role]?.[module.id]?.[action.id])} />
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[13px] text-muted-foreground">
            Admin tiene acceso completo y no se puede editar.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled>
              Descartar
            </Button>
            <Button type="button" disabled>
              Guardar permisos
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
