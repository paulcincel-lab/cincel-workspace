"use client";

import type { ReactNode } from "react";

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
import { CANCEL_LABEL, DELETE_LABEL } from "@/components/widgets/table-rows";

/**
 * In-page delete confirmation (#1041), built on the shadcn AlertDialog:
 * the question, "Cancelar" and a destructive confirm button ("Eliminar").
 */
export type ConfirmDeleteDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** The question, e.g. `TASK_DELETE_CONFIRM(title)`. */
  title: string;
  description?: string;
  /** Defaults to `DELETE_LABEL` ("Eliminar"). */
  confirmLabel?: string;
  /** The delete is running: the confirm button is disabled. */
  pending?: boolean;
  /** The confirm button is disabled, e.g. until the name is typed (#1050). */
  confirmDisabled?: boolean;
  /** Extra content between the question and the buttons (a typed confirmation, a footnote). */
  children?: ReactNode;
  onConfirm(): void;
};

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = DELETE_LABEL,
  pending = false,
  confirmDisabled = false,
  children,
  onConfirm,
}: ConfirmDeleteDialogProps): ReactNode {
  return (
    <AlertDialog open={open} onOpenChange={(next) => onOpenChange(next)}>
      <AlertDialogContent data-slot="confirm-delete">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>{CANCEL_LABEL}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending || confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
