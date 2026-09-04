import type { WorkflowType } from "./task";

export type { TaskPriority, TaskStatus, WorkflowType } from "./task";

/**
 * A project's stage in the firm's pipeline. Mirrors `WorkflowType` (which
 * already maps to `core.workflow_type` via the accent maps in
 * lib/actions/activities-actions.ts and lib/actions/maintenance-actions.ts),
 * plus the upcoming Decoración stage — not yet a value in `core.workflow_type`,
 * pending a small Drizzle migration. Diseño/Presale/Construcción-only code
 * should keep using `WorkflowType`; anything stage-aware for v2 (Actividades
 * departments, project stage badges) should use `ProjectStage`.
 */
export type ProjectStage = WorkflowType | "Decoración";

export const PROJECT_STAGES: readonly ProjectStage[] = [
  "Presale",
  "Diseño",
  "Construcción",
  "Decoración",
];

/** Stage values that already exist in `core.workflow_type` today. */
export const IMPLEMENTED_PROJECT_STAGES: readonly WorkflowType[] = [
  "Presale",
  "Diseño",
  "Construcción",
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
