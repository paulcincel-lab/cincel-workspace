/**
 * The task sheet's one page-data call (`getTaskSheetData`, Query Migration
 * 4b, #956). Client-safe: type-only.
 */
import type { CatalogAssignableStaffOption } from "@/lib/types/catalog";
import type { ProjectSpace, TaskDetail, TaskStatusOption, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

export type TaskSheetData = {
  task: TaskDetail;
  /** `catalog.taskStatuses`. */
  statuses: TaskStatusOption[];
  /** `catalog.workflows`: active tramos (the Tramo select of a task without one). */
  workflows: WorkflowRef[];
  /** `catalog.assignableStaff(task.workflowId)`: `{id,name,suggested}` only, never `Staff`. */
  assignable: CatalogAssignableStaffOption[];
  /** `catalog.projectSpaces(task.projectId)`; empty for an admin task (not seeded then). */
  spaces: ProjectSpace[];
  /** The active fases of the task's tramo, by `sortOrder` (the Fase select); empty without a tramo. */
  phases: WorkflowPhaseRef[];
};
