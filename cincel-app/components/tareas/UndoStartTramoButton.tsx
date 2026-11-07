"use client";

import { useState, useTransition } from "react";

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
import { Button } from "@/components/ui/shadcn/button";
import { undoStartTramoAction } from "@/lib/actions/tramo-start-actions";
import type { TramoBoard, WorkflowRef } from "@/lib/types/core";

import { actionErrorText } from "@/lib/errors";

export type TramoStartedEntry = TramoBoard["started"][number];

export interface UndoStartTramoButtonProps {
  workflow: WorkflowRef;
  projectName: string;
  /** The project's row of `TramoBoard.started`; nothing renders unless `canUndo`. */
  started: TramoStartedEntry | null | undefined;
  /** Refetch tasks and the board after an undo attempt. */
  onUndone: () => void | Promise<void>;
  /** Page-level `Alert` copy (FE §9), e.g. on `TOUCHED`. */
  onError: (message: string) => void;
}

/** "Deshacer inicio" in a project block header while the latest start is undoable (FE §4.3, RD-7). */
export function UndoStartTramoButton({ workflow, projectName, started, onUndone, onError }: UndoStartTramoButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!started?.canUndo || !started.batchId) return null;
  const batchId = started.batchId;

  function confirm() {
    startTransition(async () => {
      try {
        await undoStartTramoAction(batchId);
      } catch (err) {
        onError(actionErrorText(err, { tramoName: workflow.name }));
      }
      setConfirming(false);
      await onUndone();
    });
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Deshacer inicio
      </Button>
      <AlertDialog open={confirming} onOpenChange={(next) => (next ? undefined : setConfirming(false))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Deshacer el inicio de {workflow.name} en {projectName}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán las {started.createdCount} tareas creadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={isPending} onClick={confirm}>
              Deshacer inicio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
