export type { TaskPriority, TaskStatus, WorkflowType } from "./task";
import type { WorkflowType } from "./task";

/**
 * A project's stage in the firm's pipeline — now identical to `WorkflowType`
 * (all four departments map to `core.workflow_type` via the accent maps in
 * lib/actions/activities-actions.ts and lib/actions/maintenance-actions.ts).
 * Kept as a distinct alias since call sites already say `ProjectStage` for
 * stage-aware code (Actividades departments, project stage badges).
 */
export type ProjectStage = WorkflowType;

export const PROJECT_STAGES: readonly ProjectStage[] = [
  "Presale",
  "Diseño",
  "Construcción",
  "Decoración",
];

export type ProjectStatus = "Activo" | "Archivado";

export const PROJECT_STATUSES: readonly ProjectStatus[] = ["Activo", "Archivado"];

/** Directorio contact type — replaces the separate Clientes/Proveedores routes. */
export type ContactType = "Cliente" | "Contratista" | "Colaborador" | "Tienda";

export const CONTACT_TYPES: readonly ContactType[] = [
  "Cliente",
  "Contratista",
  "Colaborador",
  "Tienda",
];
