"use client";

import type { ReactNode } from "react";

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
  onConfirm(): void;
};

/** Contract stub: renders nothing until the dialog lands. */
export function ConfirmDeleteDialog(props: ConfirmDeleteDialogProps): ReactNode {
  void props;
  return null;
}
