import "server-only";

import { and, eq, isNull, ne, sql } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { db } from "@/lib/db/client";
import { projects, staff, tasks, workflowPhases } from "@/lib/db/schema";
import { displayName, occupancyPct } from "@/lib/people/aggregates";
import { getProjectForViewer } from "@/lib/projects/project-tab-shell";

/** Someone to hand a task to instead of an overloaded responsable; null when nobody qualifies. */
export type AssigneeSuggestion = {
  staffId: string;
  name: string;
  loadPct: number;
  /** The fase the person already worked on. */
  phaseName: string;
  /** The other project where they last completed a task of that fase. */
  projectName: string;
} | null;

/** Only people under this load are suggested (the "libre" bucket). */
export const SUGGESTION_MAX_LOAD_PCT = 60;

/**
 * The quick-add hint of Proyecto · Resumen (Analítico): among active staff
 * other than `excludeStaffId`, the people who completed tasks of `phaseId`
 * in other projects and are under 60 % load (open tasks as responsable ÷
 * capacity, admin tasks counted only for viewers with `canSeeAdminData`).
 * The one with the most completed tasks of that fase wins; ties go to the
 * lower load, then the name. Null without `canCreateActivity` (the composer
 * is not shown then), when the project is out of the viewer's reach or when
 * nobody qualifies.
 */
export async function suggestAssignee(
  user: AuthenticatedUser,
  input: { projectId: string; phaseId: string; excludeStaffId: string },
): Promise<AssigneeSuggestion> {
  if (!resolveProjectsCapabilities(user).canViewProjects) return null;
  if (!resolveActivitiesCapabilities(user).canCreateActivity) return null;
  const viewer = viewerScopeOf(user);
  let project: { id: string } | null = null;
  try {
    project = await getProjectForViewer(input.projectId, viewer.staffId, viewer.isAdmin);
  } catch {
    // Malformed id: out of reach.
  }
  if (!project) return null;

  const { projectId, phaseId, excludeStaffId } = input;
  const kindOk = viewer.isAdmin ? sql`true` : sql`${tasks.kind} <> 'admin'`;
  const donePhaseFilter = sql`${tasks.status} = 'completado' and ${tasks.archived} = false and ${tasks.phaseId} = ${phaseId} and ${tasks.projectId} <> ${projectId} and ${projects.deletedAt} is null`;

  const [candidates, phases] = await Promise.all([
    db
      .select({
        id: staff.id,
        name: staff.name,
        lastName: staff.lastName,
        capacity: staff.capacity,
        open: sql<number>`(count(${tasks.id}) filter (where ${tasks.status} <> 'completado' and ${tasks.archived} = false and ${projects.deletedAt} is null and ${kindOk}))::int`,
        donePhase: sql<number>`(count(${tasks.id}) filter (where ${donePhaseFilter}))::int`,
        lastProject: sql<string | null>`(array_agg(${projects.name} order by ${tasks.closedAt} desc nulls last) filter (where ${donePhaseFilter}))[1]`,
      })
      .from(staff)
      .leftJoin(tasks, and(eq(tasks.managerId, staff.id), isNull(tasks.deletedAt)))
      .leftJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(eq(staff.active, true), isNull(staff.deletedAt), ne(staff.id, excludeStaffId)))
      .groupBy(staff.id)
      .having(sql`count(${tasks.id}) filter (where ${donePhaseFilter}) > 0`),
    db.select({ name: workflowPhases.name }).from(workflowPhases).where(eq(workflowPhases.id, phaseId)).limit(1),
  ]);

  const phaseName = phases[0]?.name;
  if (!phaseName) return null;

  const ranked = candidates
    .map((row) => ({
      staffId: row.id,
      name: displayName(row.name, row.lastName),
      loadPct: occupancyPct(Number(row.open), row.capacity),
      donePhase: Number(row.donePhase),
      projectName: row.lastProject,
    }))
    .filter((row) => row.loadPct < SUGGESTION_MAX_LOAD_PCT && row.projectName)
    .sort((a, b) => b.donePhase - a.donePhase || a.loadPct - b.loadPct || a.name.localeCompare(b.name, "es"));

  const best = ranked[0];
  if (!best || !best.projectName) return null;
  return { staffId: best.staffId, name: best.name, loadPct: best.loadPct, phaseName, projectName: best.projectName };
}
