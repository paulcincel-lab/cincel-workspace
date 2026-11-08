/**
 * Light catalog rows for pickers (Query Migration 1b, #954). They carry only
 * what a select needs, never the full `Staff`, `Project` or `Contact`.
 * Client-safe: type-only.
 */
import type { ContactType, ProjectSpace, ProjectStatus, TaskStatusOption, WorkflowRef } from "@/lib/types/core";

/**
 * `catalog.projectOptions`: live projects, by name. `currentWorkflowId` is the
 * project's current tramo, the new-task dialog's default tramo.
 */
export type CatalogProjectOption = { id: string; name: string; status: ProjectStatus; currentWorkflowId: string | null };

/** `catalog.staff`: active staff, in the team's manual order. `name` is the display name (nombre + apellido). */
export type CatalogStaffOption = { id: string; name: string };

/** `catalog.assignableStaff(workflowId)`: suggested first, then by name. */
export type CatalogAssignableStaffOption = { id: string; name: string; suggested: boolean };

/** `catalog.contacts(type?)`: live contacts, by name. */
export type CatalogContactOption = { id: string; name: string; type: ContactType };

export type { ProjectSpace, TaskStatusOption, WorkflowRef };
