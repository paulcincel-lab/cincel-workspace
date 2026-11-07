"use client";

import type { TaskBoard } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

/**
 * Task board in three styles (redesign FE §4.10.1); evolves `TableroClient`
 * (drag-and-drop kept).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type TaskBoardWidgetProps = {
  board: TaskBoard;
  table: RecordTableData;
  onMove(taskId: string, statusId: string): Promise<void>;
};

export function TaskBoardWidget(props: TaskBoardWidgetProps) {
  void props;
  return null;
}
