import type {
  ContactType,
  ProjectStage,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "./enums";

/**
 * Central status → visual mapping for v2. Replaces the per-file
 * `statusColor`/`phaseColor` switch statements duplicated across
 * components/tareas/PresaleRow.tsx, app/equipo/EquipoPageClient.tsx,
 * components/proyectos/ProjectCard.tsx, app/clientes/[id]/page.tsx,
 * components/equipo/MemberEditorDrawer.tsx and MemberProfileModal.tsx.
 *
 * `variant` maps directly to shadcn Badge's `variant` prop
 * (components/ui/shadcn/badge.tsx) plus a `success` variant used the same
 * way across components/v2/status/StatusBadge.tsx.
 */
export type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "destructive"
  | "success";

export const TASK_STATUS_VARIANT: Record<TaskStatus, BadgeVariant> = {
  Pendiente: "outline",
  "En proceso": "secondary",
  Completado: "success",
  Bloqueado: "destructive",
};

export const TASK_PRIORITY_VARIANT: Record<TaskPriority, BadgeVariant> = {
  Alta: "destructive",
  Media: "secondary",
  Baja: "outline",
};

export const PROJECT_STATUS_VARIANT: Record<ProjectStatus, BadgeVariant> = {
  Activo: "outline",
  Archivado: "secondary",
};

export const PROJECT_STAGE_VARIANT: Record<ProjectStage, BadgeVariant> = {
  Presale: "secondary",
  Diseño: "secondary",
  Construcción: "secondary",
  Decoración: "secondary",
};

export const CONTACT_TYPE_VARIANT: Record<ContactType, BadgeVariant> = {
  Cliente: "secondary",
  Contratista: "secondary",
  Colaborador: "secondary",
  Tienda: "secondary",
};
