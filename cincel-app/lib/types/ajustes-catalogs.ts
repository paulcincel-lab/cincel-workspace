/**
 * Page data of the Ajustes catalog segments (Query Migration 9b, #964):
 * `qk.ajustes.page('estatus' | 'puestos' | 'tramos' | 'permisos')`.
 * Client-safe: type-only imports.
 */
import type { PermissionsState } from "@/lib/auth/permissionsState";
import type { SystemAccessRole } from "@/lib/data/roles";
import type { Position, Staff, TaskStatus, TaskStatusOption, WorkflowDetail } from "@/lib/types/core";

export type AjustesEstatusPageData = {
  statuses: TaskStatusOption[];
  /** Live tasks per `tasks.status` (every base present). */
  baseCounts: Record<TaskStatus, number>;
  /** Per custom status id: its live tasks and the distinct projects they sit in. */
  customUsage: Record<string, { tasks: number; projects: number }>;
};

/**
 * `workflows`: the active tramos with their active fases, for the candidate
 * fase picker; `templates` is `[]` and `readiness` is `null`
 * (`listWorkflowPhaseTree`).
 */
export type AjustesPuestosPageData = { positions: Position[]; workflows: WorkflowDetail[] };

export type AjustesTramosPageData = {
  workflows: WorkflowDetail[];
  /** workflowId → live active projects whose current tramo it is. */
  activeProjects: Record<string, number>;
  /** phaseId → live tasks in that fase. */
  phaseTaskCounts: Record<string, number>;
};

/**
 * One person on Ajustes › Permisos: the name and the access the server
 * resolves for them (`staff.role`, or Administrador for a default admin
 * email). No email and no profile fields: this is dehydrated into the page.
 */
export type PermisosStaffRow = Pick<Staff, "id" | "name" | "lastName" | "active"> & { access: SystemAccessRole };

export type AjustesPermisosPageData = {
  staff: PermisosStaffRow[];
  /** The default permission matrix ("Restaurar" goes back to it). */
  defaultPermissions: PermissionsState;
  /** The saved matrix merged over the defaults: what the server enforces for every role (#971). */
  permissions: PermissionsState;
  /** Whether any role differs from the defaults. */
  hasCustom: boolean;
};
