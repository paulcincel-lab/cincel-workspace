"use client";

import { CornerDownRight, Hourglass } from "lucide-react";

import { Badge } from "@/components/ui/shadcn/badge";
import type { TaskListItem } from "@/lib/types/core";

type SubtaskFields = Pick<TaskListItem, "parentTaskId" | "parentTitle">;
type ParentFields = Pick<TaskListItem, "subtaskCount" | "subtaskDoneCount">;

/** Secondary line under a child task's title: "Subtarea de {padre}". */
export function SubtaskOfLine({ task }: { task: SubtaskFields }) {
  if (!task.parentTaskId) return null;
  if (!task.parentTitle) {
    // The parent was soft-deleted: the child behaves as a top-level task.
    return (
      <span className="block text-xs text-muted-foreground">
        Tarea padre eliminada
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <CornerDownRight aria-hidden className="size-3 shrink-0" />
      <span className="truncate">Subtarea de {task.parentTitle}</span>
    </span>
  );
}

/** "2/3 subtareas" on parent rows. */
export function SubtaskCountBadge({ task }: { task: ParentFields }) {
  if (task.subtaskCount <= 0) return null;
  return (
    <Badge variant="secondary">
      {task.subtaskDoneCount}/{task.subtaskCount} subtareas
    </Badge>
  );
}

/** "En espera" when the task has open dependencies. Informational only. */
export function WaitingBadge({ waitingOn }: { waitingOn: number }) {
  if (waitingOn <= 0) return null;
  return (
    <Badge variant="outline">
      <Hourglass aria-hidden data-icon="inline-start" />
      En espera
    </Badge>
  );
}
