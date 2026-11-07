"use client";

export type TaskSheetProps = { taskId: string; onClose(): void };

/**
 * Task sheet, 520 px (redesign FE §3.4): opens from `/tareas?tarea=<id>` over
 * the mounted view. Extends `TaskDrawer` on `FormSheet`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function TaskSheet(props: TaskSheetProps) {
  void props;
  return null;
}
