"use client";

export type NewTaskDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaults?: { projectId?: string; tramoKey?: string; title?: string; description?: string };
};

/**
 * New task dialog (redesign FE §3.4): extends `NewTaskModal` on `FormDialog`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function NewTaskDialog(props: NewTaskDialogProps) {
  void props;
  return null;
}
