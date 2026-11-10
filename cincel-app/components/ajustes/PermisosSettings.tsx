"use client";

import { Fragment, useMemo, useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CheckIcon, ChevronDownIcon, EyeIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { SettingsSaveBar } from "@/components/ajustes/SettingsSaveBar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { restoreDefaultPermissionsAction, savePermissionsMatrixAction } from "@/lib/actions/permissions-actions";
import { isPermissionLocked, isProtectedPermissionRole } from "@/lib/auth/permissions";
import {
  PERMISSIONS_MODULES_REGISTRY,
  type PermissionActionDefinition,
  type PermissionValue,
} from "@/lib/auth/permissionsRegistry";
import { describePermissionChanges, type PermissionsState } from "@/lib/auth/permissionsState";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesPermisosOptions } from "@/lib/query/options/ajustes";
import { PermisosFormStoreProvider, usePermisosForm, usePermisosFormApi } from "@/lib/stores/ajustes/permisos-form-store";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import type { AjustesPermisosPageData, PermisosStaffRow } from "@/lib/types/ajustes-catalogs";
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

/** Whether a save from `before` to `after` changes what `role` may do. */
function roleChanged(before: PermissionsState, after: PermissionsState, role: SystemAccessRole): boolean {
  const pick = (state: PermissionsState) => ({ [role]: state[role] }) as PermissionsState;
  return describePermissionChanges(pick(before), pick(after)).length > 0;
}

/** The editable control of one capability for one access. */
function EditableCell({
  role,
  moduleId,
  action,
  value,
}: {
  role: SystemAccessRole;
  moduleId: string;
  action: PermissionActionDefinition;
  value: PermissionValue | undefined;
}) {
  const form = usePermisosFormApi();
  const label = `${action.label} · ${role}`;

  if (action.type === "select") {
    const items = Object.fromEntries((action.options ?? []).map((option) => [option.value, option.label]));
    return (
      <Select
        items={items}
        value={typeof value === "string" ? value : null}
        onValueChange={(next) => {
          if (typeof next === "string") form.getState().setCell(role, moduleId, action.id, next);
        }}
      >
        <SelectTrigger aria-label={label} className="h-8 w-[150px] rounded-lg px-2 text-[12px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(action.options ?? []).map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Checkbox
      aria-label={label}
      checked={value === true}
      onCheckedChange={(checked) => form.getState().setCell(role, moduleId, action.id, checked === true)}
    />
  );
}

/**
 * Ajustes › Permisos (redesign FE §3.8, #950, #971, frame `Ajustes-Permisos`):
 * the permission matrix per access, saved on the server and enforced by every
 * server check and the client gating. Reads `qk.ajustes.page('permisos')`,
 * hydrated by the page; the draft lives in a page-scoped store
 * (`permisos-form-store`). Administrador and the capped exports are read only.
 */
export function PermisosSettings() {
  const { permissions } = useSuspenseQuery(ajustesPermisosOptions()).data;
  return (
    <PermisosFormStoreProvider initial={{ saved: permissions }}>
      <PermisosEditor />
    </PermisosFormStoreProvider>
  );
}

function PermisosEditor() {
  const { staff, permissions: saved, hasCustom } = useSuspenseQuery(ajustesPermisosOptions()).data;
  const byAccess = useMemo(() => groupByAccess(staff), [staff]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmRestore, setConfirmRestore] = useState(false);
  const form = usePermisosFormApi();
  const draft = usePermisosForm((s) => s.draft);
  const error = usePermisosForm((s) => s.error);
  const dirtyCount = useMemo(() => describePermissionChanges(saved, draft).length, [saved, draft]);
  const viewer = useSessionStore(selectCurrentUser);
  const queryClient = useQueryClient();
  const router = useRouter();

  function applySaved(next: { permissions: PermissionsState; hasCustom: boolean }, before: PermissionsState) {
    queryClient.setQueryData<AjustesPermisosPageData>(qk.ajustes.page("permisos"), (page) =>
      page ? { ...page, permissions: next.permissions, hasCustom: next.hasCustom } : page,
    );
    form.getState().replace(next.permissions);
    // A change to the viewer's own access: drop every cached screen and re-read the session (plan §4.8).
    if (viewer && !isProtectedPermissionRole(viewer.access) && roleChanged(before, next.permissions, viewer.access)) {
      queryClient.clear();
      router.refresh();
    }
  }

  const save = useActionMutation(savePermissionsMatrixAction, {
    setData: (_qc, next) => applySaved(next, saved),
    invalidate: [qk.ajustes.page("permisos")],
    onFormError: (text) => form.getState().setError(text),
    successToast: "Permisos guardados",
  });

  const restore = useActionMutation(restoreDefaultPermissionsAction, {
    setData: (_qc, next) => applySaved(next, saved),
    invalidate: [qk.ajustes.page("permisos")],
    onFormError: (text) => form.getState().setError(text),
    successToast: "Permisos restaurados",
  });

  function toggle(moduleId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  }

  function submit() {
    if (save.isPending || restore.isPending) return;
    form.getState().setError(null);
    save.mutate({ permissions: draft });
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-labelledby="permisos-por-acceso"
        className="flex min-w-0 flex-col gap-4 rounded-[14px] border border-border bg-card p-5 text-card-foreground shadow-xs"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id="permisos-por-acceso" className="text-[15px] font-semibold text-foreground">
              Permisos por acceso
            </h2>
            <p className="text-[13px] text-muted-foreground">
              Qué puede ver y hacer cada nivel de acceso en cada módulo. Los cambios aplican a todas las personas con
              ese acceso desde su siguiente acción.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasCustom || restore.isPending || save.isPending}
            onClick={() => setConfirmRestore(true)}
          >
            Restaurar valores por defecto
          </Button>
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
                            <Cell cell={moduleSummary(module.actions, draft[role]?.[module.id])} />
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
                            {SYSTEM_ACCESS_ROLES.map((role) => {
                              const value = draft[role]?.[module.id]?.[action.id];
                              return (
                                <td key={role} className="px-2 py-2 text-center">
                                  <span className="inline-flex justify-center">
                                    {isPermissionLocked(role, module.id, action.id) ? (
                                      <Cell cell={permissionCell(action, value)} />
                                    ) : (
                                      <EditableCell role={role} moduleId={module.id} action={action} value={value} />
                                    )}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[13px] text-muted-foreground">
          Admin tiene acceso completo y no se puede editar. Exportar datos solo está disponible para Administrador y
          Dirección.
        </p>
      </section>

      <SettingsSaveBar
        dirtyCount={dirtyCount}
        saving={save.isPending}
        onDiscard={() => form.getState().replace(saved)}
        onSave={submit}
        saveLabel="Guardar permisos"
        error={error}
      />

      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restaurar los permisos por defecto?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos los accesos vuelven a sus permisos por defecto y se descartan los cambios sin guardar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRestore(false);
                form.getState().setError(null);
                restore.mutate(undefined);
              }}
            >
              Restaurar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
