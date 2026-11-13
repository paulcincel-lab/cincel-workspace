"use client";

import { useId, useState } from "react";

import { CatalogEditorPanel } from "@/components/ajustes/CatalogEditorPanel";
import { CatalogPanelFooter } from "@/components/ajustes/catalog-parts";
import { Avatar, AvatarFallback } from "@/components/ui/shadcn/avatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { etapaColorClass } from "@/lib/etapas/etapa-color";
import type { Position, WorkflowDetail } from "@/lib/types/core";
import { cn } from "@/lib/utils";

export type PositionDraft = { name: string; weeklyCapacityHours: number | null; phaseIds: string[] };

export const CAPACITY_RANGE_ERROR = "Escribe un número de 0 a 80.";

/** "40" → 40, "" → null; undefined when it is not a whole number from 0 to 80. */
export function parseCapacity(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0 || value > 80) return undefined;
  return value;
}

/** Etapas in `sortOrder`, each with its active fases in catalog order; etapas without fases are left out. */
export function groupPhasesByEtapa(workflows: WorkflowDetail[]) {
  return [...workflows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
      key: workflow.key,
      sortOrder: workflow.sortOrder,
      colorSlot: workflow.colorSlot ?? null,
      phases: workflow.phases
        .filter((phase) => phase.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((group) => group.phases.length > 0);
}

interface PositionEditorDrawerProps {
  show: boolean;
  onClose: () => void;
  /** Null when creating a new puesto. */
  position: Position | null;
  workflows: WorkflowDetail[];
  canManage: boolean;
  isSaving: boolean;
  formError: string;
  onSave: (draft: PositionDraft) => void;
  /** "Eliminar puesto" (the page asks first). */
  onDelete?: (position: Position) => void;
  /** Where focus goes back on close (the row's "•••"). */
  returnFocus?: () => HTMLElement | null | undefined;
}

/**
 * Editor of a puesto (Ajustes › Puestos, frame `Ajustes-Puestos`): its name,
 * weekly capacity, candidate fases grouped by etapa and its members
 * (read-only). Inline next to the list from 1024 px, a `Sheet` below.
 */
export function PositionEditorDrawer({ show, onClose, position, returnFocus, onDelete, ...rest }: PositionEditorDrawerProps) {
  const formId = useId();
  const [localError, setLocalError] = useState("");
  // Clear the capacity error whenever the panel opens or switches puesto (state adjusted during render).
  const [shown, setShown] = useState({ show, id: position?.id ?? null });
  if (shown.show !== show || shown.id !== (position?.id ?? null)) {
    setShown({ show, id: position?.id ?? null });
    setLocalError("");
  }
  const googleManaged = Boolean(position?.googleManaged);

  return (
    <CatalogEditorPanel
      title={position ? `Editar puesto · ${position.name}` : "Nuevo puesto"}
      open={show}
      onClose={onClose}
      returnFocus={returnFocus}
      footer={
        <CatalogPanelFooter
          onCancel={onClose}
          formId={formId}
          saving={rest.isSaving}
          canSave={rest.canManage}
          error={localError || rest.formError || null}
          destructive={
            position && rest.canManage && onDelete ? (
              <Button
                type="button"
                variant="destructive"
                disabled={googleManaged}
                title={googleManaged ? "Lo usa un grupo de Google." : undefined}
                onClick={() => onDelete(position)}
              >
                Eliminar puesto
              </Button>
            ) : null
          }
        />
      }
    >
      {/* Keyed so the form resets each time a different puesto (or a new one) opens. */}
      <PositionEditorForm key={position?.id ?? "new"} formId={formId} position={position} onInvalid={setLocalError} {...rest} />
    </CatalogEditorPanel>
  );
}

function PositionEditorForm({
  formId,
  position,
  workflows,
  canManage,
  onSave,
  onInvalid,
}: Pick<PositionEditorDrawerProps, "position" | "workflows" | "canManage" | "onSave"> & {
  formId: string;
  onInvalid: (message: string) => void;
}) {
  const [name, setName] = useState(position?.name ?? "");
  const [capacity, setCapacity] = useState(
    position?.weeklyCapacityHours === null || position?.weeklyCapacityHours === undefined
      ? ""
      : String(position.weeklyCapacityHours),
  );
  const [phaseIds, setPhaseIds] = useState<string[]>(() => position?.phases.map((phase) => phase.id) ?? []);
  const groups = groupPhasesByEtapa(workflows);
  const members = position?.members ?? [];
  const capacityInvalid = parseCapacity(capacity) === undefined;

  function togglePhase(phaseId: string, checked: boolean) {
    setPhaseIds((current) =>
      checked ? (current.includes(phaseId) ? current : [...current, phaseId]) : current.filter((id) => id !== phaseId),
    );
  }

  return (
    <form
      id={formId}
      // The capacity range shows its own message instead of the browser's.
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        const weeklyCapacityHours = parseCapacity(capacity);
        if (weeklyCapacityHours === undefined) {
          onInvalid(CAPACITY_RANGE_ERROR);
          return;
        }
        onInvalid("");
        onSave({ name, weeklyCapacityHours, phaseIds });
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-name`}>Nombre</Label>
        <Input
          id={`${formId}-name`}
          type="text"
          value={name}
          disabled={!canManage}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${formId}-capacity`}>Capacidad por semana (horas)</Label>
        <Input
          id={`${formId}-capacity`}
          type="number"
          inputMode="numeric"
          min={0}
          max={80}
          step={1}
          value={capacity}
          disabled={!canManage}
          aria-invalid={capacityInvalid ? true : undefined}
          onChange={(event) => setCapacity(event.target.value)}
        />
      </div>

      <section className="flex flex-col gap-3" aria-labelledby={`${formId}-phases`}>
        <div>
          <h3 id={`${formId}-phases`} className="text-sm font-semibold text-foreground">
            Fases candidatas
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Los candidatos solo se sugieren al asignar tareas; cualquiera puede asignarse.
          </p>
        </div>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aún no hay fases.</p>
        ) : (
          groups.map((group) => (
            <fieldset key={group.id} className="flex flex-col gap-2">
              <legend className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", etapaColorClass(group))} />
                {group.name}
              </legend>
              {group.phases.map((phase) => {
                const id = `${formId}-phase-${phase.id}`;
                return (
                  <div key={phase.id} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={phaseIds.includes(phase.id)}
                      disabled={!canManage}
                      onCheckedChange={(checked) => togglePhase(phase.id, checked === true)}
                    />
                    <Label htmlFor={id} className="text-sm font-normal">
                      {phase.name}
                    </Label>
                  </div>
                );
              })}
            </fieldset>
          ))
        )}
      </section>

      {position ? (
        <section className="flex flex-col gap-2" aria-labelledby={`${formId}-members`}>
          <div className="flex items-center gap-2">
            <h3 id={`${formId}-members`} className="text-sm font-semibold text-foreground">
              Integrantes
            </h3>
            <Badge variant="count">{members.length}</Badge>
          </div>
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie tiene este puesto todavía.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li key={member.id} className="flex items-center gap-2 text-sm">
                  <Avatar size="sm">
                    <AvatarFallback>{member.initials}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 truncate">{member.name}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">El puesto de cada persona se cambia en Personas.</p>
        </section>
      ) : null}
    </form>
  );
}
