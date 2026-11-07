"use client";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Textarea } from "@/components/ui/shadcn/textarea";
import type { TaskPriority, WorkflowPhaseRef } from "@/lib/types/core";

export interface TemplateDraft {
  title: string;
  /** Required: a template always has a fase of its tramo. */
  phaseId: string;
  notes: string;
  defaultPriority: TaskPriority;
  commitmentOffsetDays: string;
  reviewOffsetDays: string;
  deliveryOffsetDays: string;
  active: boolean;
}

export const emptyTemplateDraft: TemplateDraft = {
  title: "",
  phaseId: "",
  notes: "",
  defaultPriority: "media",
  commitmentOffsetDays: "",
  reviewOffsetDays: "",
  deliveryOffsetDays: "",
  active: true,
};

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

interface TemplateTaskDrawerProps {
  show: boolean;
  onClose: () => void;
  editingId: string | null;
  workflowName: string;
  /** The tramo's active fases, in catalog order. */
  phases: WorkflowPhaseRef[];
  draft: TemplateDraft;
  onChangeDraft: React.Dispatch<React.SetStateAction<TemplateDraft>>;
  formError: string;
  onSave: () => void;
  canSave: boolean;
  isSaving?: boolean;
}

/** Slide-in form for adding or editing a tramo's template task. */
export function TemplateTaskDrawer({
  show,
  onClose,
  editingId,
  workflowName,
  phases,
  draft,
  onChangeDraft,
  formError,
  onSave,
  canSave,
  isSaving = false,
}: TemplateTaskDrawerProps) {
  const phaseItems = Object.fromEntries(phases.map((p) => [p.id, p.name]));
  const hasPhases = phases.length > 0;
  const canSubmit = canSave && hasPhases && Boolean(draft.phaseId) && !isSaving;

  return (
    <Sheet open={show} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[560px] max-w-[560px] overflow-y-auto text-foreground">
        <SheetHeader>
          <SheetTitle>{editingId === null ? "Nueva tarea de plantilla" : "Editar tarea de plantilla"}</SheetTitle>
          <p className="text-xs text-muted-foreground">Tramo: {workflowName}</p>
        </SheetHeader>

        <div className="space-y-4 px-6 py-4">
          <div>
            <label htmlFor="template-title" className="mb-2 block text-sm font-medium text-foreground">Tarea</label>
            <Input
              id="template-title"
              type="text"
              value={draft.title}
              onChange={(event) => onChangeDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Ej. Levantamiento inicial"
            />
          </div>

          <div>
            <label id="template-phase-label" className="mb-2 block text-sm font-medium text-foreground">Fase</label>
            <Select
              items={phaseItems}
              value={draft.phaseId || null}
              onValueChange={(value) => onChangeDraft((current) => ({ ...current, phaseId: (value as string | null) ?? "" }))}
              disabled={!hasPhases}
            >
              <SelectTrigger className="w-full" aria-labelledby="template-phase-label" aria-describedby="template-phase-help">
                <SelectValue placeholder="Elige una fase" />
              </SelectTrigger>
              <SelectContent>
                {phases.map((phase) => (
                  <SelectItem key={phase.id} value={phase.id}>
                    {phase.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p id="template-phase-help" className="mt-1 text-xs text-muted-foreground">
              {hasPhases ? "Obligatoria. La tarea se crea cuando se inicia esta fase." : "Este tramo aún no tiene fases."}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Prioridad por defecto</label>
            <Select
              items={Object.fromEntries(PRIORITY_OPTIONS.map((o) => [o.value, o.label]))}
              value={draft.defaultPriority}
              onValueChange={(value) => onChangeDraft((current) => ({ ...current, defaultPriority: value as TaskPriority }))}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Compromiso (días)</label>
              <Input
                type="number"
                value={draft.commitmentOffsetDays}
                onChange={(event) => onChangeDraft((current) => ({ ...current, commitmentOffsetDays: event.target.value }))}
                placeholder="—"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Revisión (días)</label>
              <Input
                type="number"
                value={draft.reviewOffsetDays}
                onChange={(event) => onChangeDraft((current) => ({ ...current, reviewOffsetDays: event.target.value }))}
                placeholder="—"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">Entrega (días)</label>
              <Input
                type="number"
                value={draft.deliveryOffsetDays}
                onChange={(event) => onChangeDraft((current) => ({ ...current, deliveryOffsetDays: event.target.value }))}
                placeholder="—"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Días relativos al inicio del tramo, usados al crear las tareas del proyecto.
          </p>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Notas</label>
            <Textarea
              value={draft.notes}
              onChange={(event) => onChangeDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Instrucciones u observaciones para esta tarea"
            />
          </div>

          {editingId !== null ? (
            <label className="flex items-center gap-3 rounded-xl border border-border bg-muted p-3">
              <Checkbox
                checked={draft.active}
                onCheckedChange={(checked) => onChangeDraft((current) => ({ ...current, active: checked === true }))}
              />
              <span className="text-sm text-foreground">Tarea de plantilla activa</span>
            </label>
          ) : null}

          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={!canSubmit}
            title={canSave ? "" : "No tienes permiso para guardar cambios"}
          >
            Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
