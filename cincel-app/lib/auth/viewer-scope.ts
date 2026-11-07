import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData } from "@/lib/auth/permissions";
import type { Project, ProjectDetail, TaskListItem, ViewerScope } from "@/lib/types/core";

/**
 * Who is reading (project flow BE §6, §12). Actions build it from the session
 * and pass it to every repository read; non-admins never receive client,
 * origin or admin task data.
 */
export function viewerScopeOf(user: AuthenticatedUser): ViewerScope {
  return { staffId: user.member.id, isAdmin: canSeeAdminData(user) };
}

/**
 * Scope for repository reads that return to another repository function or
 * to an action that scopes the result again (`scopeProjectDto`,
 * `scopeTaskDto`). Never hand its result straight to a client.
 */
export const UNSCOPED_VIEWER: ViewerScope = { staffId: "", isAdmin: true };

type ProjectAdminFields = Pick<Project, "clientId" | "origin" | "originStaffId"> &
  Partial<Pick<ProjectDetail, "client" | "originStaff" | "mondayImport">>;

/** Nulls client, origin and monday import data for non-admins (BE §8.5, §12). */
export function scopeProjectDto<T extends ProjectAdminFields>(project: T, viewer: ViewerScope): T {
  if (viewer.isAdmin) return project;
  const out: T = { ...project, clientId: null, origin: null, originStaffId: null };
  if ("client" in project) out.client = null;
  if ("originStaff" in project) out.originStaff = null;
  if ("mondayImport" in project) out.mondayImport = null;
  return out;
}

/** `project.clientName` is null for non-admins (BE §7.5). */
export function scopeTaskDto<T extends Pick<TaskListItem, "project">>(task: T, viewer: ViewerScope): T {
  if (viewer.isAdmin || task.project.clientName === null) return task;
  return { ...task, project: { ...task.project, clientName: null } };
}
