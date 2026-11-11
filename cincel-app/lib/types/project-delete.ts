/**
 * Deleting and restoring a project (#1050). A delete soft-deletes the
 * project and its live tasks and subtasks with one `deleted_at`, revokes the
 * project's portal access and writes the history rows; the Drive folder and
 * the monday data stay. A restore within 30 days brings back the project and
 * exactly the tasks deleted with it. Client-safe: types only.
 */
import type { StaffRef } from "@/lib/types/core";

/** Days a deleted project can be restored. */
export const PROJECT_RESTORE_DAYS = 30;

/** The delete dialog's counts (`qk.proyectos.deletePreview(id)`). */
export type ProjectDeletePreview = {
  id: string;
  name: string;
  /** Live tasks and subtasks the delete takes with it. */
  taskCount: number;
  /** Of those, the open ones: more than 0 asks to type the project name. */
  openTaskCount: number;
};

/** `deleteProjectAction` data: what the "Deshacer" toast restores. */
export type ProjectDeleteResult = {
  id: string;
  /** ISO; the `deleted_at` the project and its tasks share. Filled by #1050. */
  deletedAt?: string;
  /** Tasks and subtasks deleted with the project. Filled by #1050. */
  deletedTaskCount?: number;
};

/** `restoreProjectAction` data. */
export type ProjectRestoreResult = { id: string; restoredTaskCount: number };

/** One row of the admin "Proyectos eliminados" list (`qk.proyectos.deleted()`). */
export type DeletedProjectRow = {
  id: string;
  name: string;
  clientName: string | null;
  /** ISO. */
  deletedAt: string;
  deletedBy: StaffRef | null;
  taskCount: number;
  /** ISO: `deletedAt` + `PROJECT_RESTORE_DAYS`. */
  restorableUntil: string;
};
