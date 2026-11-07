"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { createWorkflowPhaseAction, updateWorkflowPhaseAction } from "@/lib/actions/workflows-actions";
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

/** Slide-in form with one field, "Nombre", for creating or renaming a fase. */
export function PhaseEditorDrawer({ open, workflow, phase, onClose, onSaved }: PhaseEditorDrawerProps) {
  const [name, setName] = useState(phase?.name ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset the form each time the drawer opens or switches fase (state adjusted during render, not in an effect).
  const [shown, setShown] = useState({ open, phase });
  if (shown.open !== open || shown.phase !== phase) {
    setShown({ open, phase });
    if (open) {
      setName(phase?.name ?? "");
      setError("");
      setSaving(false);
    }
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Escribe un nombre.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = phase
        ? await updateWorkflowPhaseAction(phase.id, { name: trimmed })
        : await createWorkflowPhaseAction(workflow.id, { name: trimmed });
      onSaved(saved);
    } catch (err) {
      setError(tramosErrorText(err, { kind: "phase", workflowName: workflow.name }));
    } finally {
      setSaving(false);
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
