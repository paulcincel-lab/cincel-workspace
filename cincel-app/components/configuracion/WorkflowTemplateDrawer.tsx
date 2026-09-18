"use client";

import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Textarea } from "@/components/ui/shadcn/textarea";
import type { TaskPriority } from "@/lib/types/core";

export interface TemplateDraft {
  title: string;
  phase: string;
  notes: string;
  defaultPriority: TaskPriority;
  commitmentOffsetDays: string;
  reviewOffsetDays: string;
  deliveryOffsetDays: string;
  active: boolean;
}

export const emptyTemplateDraft: TemplateDraft = {
  title: "",
  phase: "",
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

interface WorkflowTemplateDrawerProps {
  show: boolean;
  onClose: () => void;
  editingId: string | null;
  workflowName: string;
  draft: TemplateDraft;
  onChangeDraft: React.Dispatch<React.SetStateAction<TemplateDraft>>;
  formError: string;
  onSave: () => void;
  canSave: boolean;
}

/** Slide-in form for adding or editing a workflow task template. */
export function WorkflowTemplateDrawer({
  show,
  onClose,
  editingId,
  workflowName,
  draft,
  onChangeDraft,
  formError,
  onSave,
  canSave,
}: WorkflowTemplateDrawerProps) {
  return (
    <Sheet open={show} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[560px] max-w-[560px] overflow-y-auto text-foreground">
        <SheetHeader>
          <SheetTitle>{editingId === null ? "Nueva plantilla" : "Editar plantilla"}</SheetTitle>
          <p className="text-xs text-muted-foreground">Workflow: {workflowName}</p>
        </SheetHeader>

        <div className="space-y-4 px-6 py-4">
          {formError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {formError}
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Título</label>
            <Input
              type="text"
              value={draft.title}
              onChange={(event) => onChangeDraft((current) => ({ ...current, title: event.target.value }))}
              placeholder="Ej. Levantamiento inicial"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Fase</label>
            <Input
              type="text"
              value={draft.phase}
              onChange={(event) => onChangeDraft((current) => ({ ...current, phase: event.target.value }))}
              placeholder="Ej. Anteproyecto"
            />
            <p className="mt-1 text-xs text-muted-foreground">Opcional. Agrupa la tarea dentro del workflow.</p>
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
            Días relativos al arranque de la etapa, usados al estampar las tareas del proyecto.
          </p>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Notas</label>
            <Textarea
              value={draft.notes}
              onChange={(event) => onChangeDraft((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Instrucciones u observaciones para esta plantilla"
            />
          </div>

          {editingId !== null ? (
            <label className="flex items-center gap-3 rounded-xl border border-border bg-muted p-3">
              <Checkbox
                checked={draft.active}
                onCheckedChange={(checked) => onChangeDraft((current) => ({ ...current, active: checked === true }))}
              />
              <span className="text-sm text-foreground">Plantilla activa</span>
            </label>
          ) : null}
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            title={canSave ? "" : "No tienes permiso para guardar cambios"}
          >
            Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
