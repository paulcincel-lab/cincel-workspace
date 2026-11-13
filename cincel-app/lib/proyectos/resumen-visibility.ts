/**
 * Who sees what on Proyecto · Resumen (redesign FE §3.5, B8). Pure; the page
 * decides on the server and drops what the viewer may not see before any
 * data reaches the client.
 */
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveClientsCapabilities } from "@/lib/auth/permissions";
import { canSeeAdminData } from "@/lib/etapas/compat";
import type { ProjectDetail } from "@/lib/types/core";

/** Whether the viewer is on the project team (responsable, coordinador or miembro). */
export function isProjectMember(project: Pick<ProjectDetail, "manager" | "coordinator" | "members">, staffId: string): boolean {
  return (
    project.manager?.id === staffId ||
    project.coordinator?.id === staffId ||
    project.members.some((m) => m.id === staffId && m.active !== false)
  );
}

/**
 * "Cliente y contactos" visibility (B8): `canSeeAdminData`, or a project
 * member with `clients.canViewClients`.
 */
export function canSeeClientContacts(
  user: AuthenticatedUser,
  project: Pick<ProjectDetail, "manager" | "coordinator" | "members">,
): boolean {
  if (canSeeAdminData(user)) return true;
  return isProjectMember(project, user.member.id) && resolveClientsCapabilities(user).canViewClients;
}

/** Client and contact data never leave the server for a viewer who may not see them. */
export function scopeProjectForResumen(project: ProjectDetail, showClientContacts: boolean): ProjectDetail {
  return showClientContacts ? project : { ...project, client: null, contacts: [] };
}
