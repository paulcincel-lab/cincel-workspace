"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { createWorkflowPhaseAction, updateWorkflowPhaseAction } from "@/lib/actions/workflows-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { PHASE_INVALIDATIONS } from "@/lib/tramos/invalidations";
import { tramosErrorText } from "@/lib/tramos/tramos-error-text";
import type { WorkflowPhase, WorkflowRef } from "@/lib/types/core";

export interface PhaseEditorDrawerProps {
  open: boolean;
  workflow: WorkflowRef;
  /** Null = new fase (appended last). */
  phase: WorkflowPhase | null;
  onClose: () => void;
  onSaved: (p: WorkflowPhase) => void;
}

type SavePhaseVars = { workflowId: string; phaseId: string | null; name: string };

function savePhase({ workflowId, phaseId, name }: SavePhaseVars) {
  return phaseId ? updateWorkflowPhaseAction(phaseId, { name }) : createWorkflowPhaseAction(workflowId, { name });
}

/**
 * Slide-in form with one field, "Nombre", for creating or renaming a fase.
 * The save is one POST that invalidates `PHASE_INVALIDATIONS` (Tramos,
 * Puestos, the tramo catalog, Tareas and Proyectos).
 */
export function PhaseEditorDrawer({ open, workflow, phase, onClose, onSaved }: PhaseEditorDrawerProps) {
  const [name, setName] = useState(phase?.name ?? "");
  const [error, setError] = useState("");
  const saveMutation = useActionMutation(savePhase, {
    invalidate: PHASE_INVALIDATIONS,
    // The drawer shows the error inline with the Tramos copy.
    onFormError: () => undefined,
  });
  const saving = saveMutation.isPending;

  // Reset the form each time the drawer opens or switches fase (state adjusted during render, not in an effect).
  const [shown, setShown] = useState({ open, phase });
  if (shown.open !== open || shown.phase !== phase) {
    setShown({ open, phase });
    if (open) {
      setName(phase?.name ?? "");
      setError("");
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Escribe un nombre.");
      return;
    }
    setError("");
    try {
      const saved = await saveMutation.mutateAsync({ workflowId: workflow.id, phaseId: phase?.id ?? null, name: trimmed });
      onSaved(saved);
    } catch (err) {
      setError(tramosErrorText(err, { kind: "phase", workflowName: workflow.name }));
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="w-[480px] max-w-[480px] overflow-y-auto text-foreground">
        <SheetHeader>
          <SheetTitle>{phase === null ? "Nueva fase" : "Editar fase"}</SheetTitle>
          <p className="text-xs text-muted-foreground">Tramo: {workflow.name}</p>
        </SheetHeader>

        <form
          className="space-y-4 px-6 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div>
            <label htmlFor="phase-name" className="mb-2 block text-sm font-medium text-foreground">Nombre</label>
            <Input
              id="phase-name"
              type="text"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Ejecutivo"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "phase-name-error" : undefined}
            />
          </div>

          {error ? (
            <Alert variant="destructive" id="phase-name-error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </form>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            Guardar
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
