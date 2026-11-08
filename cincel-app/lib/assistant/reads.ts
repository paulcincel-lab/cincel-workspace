import "server-only";

import { resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import type { ProjectFilters } from "@/lib/repositories/projects-repository";
import * as projectsRepository from "@/lib/repositories/projects-repository";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import type { ProjectListItem, TaskFilters, TaskListItem } from "@/lib/types/core";

/**
 * Viewer-scoped list reads for the assistant tools and resolvers (Query
 * Migration Phase 10, #944). They run inside the chat route, so they read
 * the repositories directly instead of going through the screens' server
 * actions. Same capability checks and viewer scope those actions applied.
 */

/** Live projects the session user can see; empty without `canViewProjects`. */
export async function listViewerProjects(filters: ProjectFilters = {}): Promise<ProjectListItem[]> {
  const user = await requireCapabilityUser();
  if (!resolveProjectsCapabilities(user).canViewProjects) return [];
  return projectsRepository.listProjects(filters, viewerScopeOf(user));
}

/** Tasks the session user can see; empty without `canViewActivities`. Admin tasks only for administrators. */
export async function listViewerTasks(filters: TaskFilters = {}): Promise<TaskListItem[]> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canViewActivities) return [];
  return tasksRepository.listTasks(filters, viewerScopeOf(user));
}

/** The session user's own tasks; an administrator also gets their own admin tasks. */
export async function listViewerMyTasks(filters: TaskFilters = {}): Promise<TaskListItem[]> {
  const user = await requireCapabilityUser();
  return tasksRepository.listMyTasks(user.member.id, filters, viewerScopeOf(user));
}
