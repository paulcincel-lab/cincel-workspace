"use client";

import { useState } from "react";

import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import type { Position, WorkflowDetail } from "@/lib/types/core";

export type PositionDraft = { name: string; phaseIds: string[] };

/** Tramos in `sortOrder`, each with its active fases in catalog order; tramos without fases are left out. */
export function groupPhasesByTramo(workflows: WorkflowDetail[]) {
  return [...workflows]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((workflow) => ({
      id: workflow.id,
      name: workflow.name,
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
}

/** Slide-in form for a puesto: its name and its candidate fases, grouped by tramo. */
export function PositionEditorDrawer({ show, ...rest }: PositionEditorDrawerProps) {
  return (
    <Sheet open={show} onOpenChange={(next) => { if (!next) rest.onClose(); }}>
      <SheetContent className="w-[560px] max-w-[560px] overflow-y-auto text-foreground">
        {/* Keyed so the form resets each time a different puesto (or a new one) opens. */}
        {show ? <PositionEditorForm key={rest.position?.id ?? "new"} {...rest} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function PositionEditorForm({
  onClose,
  position,
  workflows,
  canManage,
  isSaving,
  formError,
  onSave,
}: Omit<PositionEditorDrawerProps, "show">) {
  const [name, setName] = useState(position?.name ?? "");
  const [phaseIds, setPhaseIds] = useState<string[]>(() => position?.phases.map((phase) => phase.id) ?? []);
  const groups = groupPhasesByTramo(workflows);

  function togglePhase(phaseId: string, checked: boolean) {
    setPhaseIds((current) =>
      checked ? (current.includes(phaseId) ? current : [...current, phaseId]) : current.filter((id) => id !== phaseId),
    );
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{position ? "Editar puesto" : "Nuevo puesto"}</SheetTitle>
      </SheetHeader>

      <form
        className="space-y-6 px-6 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ name, phaseIds });
        }}
      >
        {formError ? (
          <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {formError}
          </div>
        ) : null}

        <FormField>
          <Label htmlFor="position-name" className="mb-2 block">Nombre</Label>
          <Input
            id="position-name"
            type="text"
            value={name}
            disabled={!canManage}
            onChange={(event) => setName(event.target.value)}
          />
        </FormField>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Fases candidatas</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Los candidatos solo se sugieren al asignar tareas; cualquiera puede asignarse.
            </p>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay fases.</p>
          ) : (
            groups.map((group) => (
              <fieldset key={group.id} className="space-y-2">
                <legend className="text-xs font-medium text-muted-foreground">{group.name}</legend>
                {group.phases.map((phase) => {
                  const id = `position-phase-${phase.id}`;
                  return (
                    <div key={phase.id} className="flex items-center gap-2">
                      <Checkbox
                        id={id}
                        checked={phaseIds.includes(phase.id)}
                        disabled={!canManage}
                        onCheckedChange={(checked) => togglePhase(phase.id, checked === true)}
                      />
                      <Label htmlFor={id} className="text-sm font-normal">{phase.name}</Label>
                    </div>
                  );
                })}
              </fieldset>
            ))
          )}
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {canManage ? (
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Guardando…" : "Guardar"}
            </Button>
          ) : null}
        </div>
      </form>
    </>
  );
}
