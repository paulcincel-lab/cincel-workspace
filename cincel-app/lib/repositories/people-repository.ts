/**
 * Reads behind the Personas aggregates (redesign BE §7.11): open assigned
 * tasks, active projects by role and which staff have a profile photo.
 * Admin tasks (`kind = 'admin'`) are left out unless `includeAdmin`; the
 * caller decides that from `canSeeAdminData` (BE §9.7).
 */
import { and, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  historyEvents,
  projectMembers,
  projects,
  staff,
  staffPhotos,
  taskStatuses,
  taskSupport,
  tasks,
  workflows,
} from "@/lib/db/schema";

import { ADMIN_PROJECT_ACTIVITY_FIELDS, type ActivityEventRow } from "@/lib/people/activity";

export type StaffRow = typeof staff.$inferSelect;

/** An open task assigned to `staffId` (as responsable or support). */
export type AssignedOpenTask = {
  staffId: string;
  id: string;
  title: string;
  status: string;
  due: string | null;
  projectName: string;
  tramo: string | null;
};

export type StaffProjectRole = "responsable" | "coordinador" | "miembro";

export type StaffActiveProject = {
  staffId: string;
  projectId: string;
  name: string;
  progress: number;
  role: StaffProjectRole;
};

/** One live staff row (active or not), or null. */
export async function getStaffRow(id: string): Promise<StaffRow | null> {
  const [row] = await db
    .select()
    .from(staff)
    .where(and(eq(staff.id, id), isNull(staff.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Live, unarchived, open (not completado, no closing custom status) tasks on live projects. */
function openTaskConditions(includeAdmin: boolean) {
  return and(
    isNull(tasks.deletedAt),
    eq(tasks.archived, false),
    ne(tasks.status, "completado"),
    or(isNull(tasks.customStatusId), eq(taskStatuses.closes, false)),
    isNull(projects.deletedAt),
    includeAdmin ? undefined : ne(tasks.kind, "admin")
  );
}

const taskColumns = {
  id: tasks.id,
  title: tasks.title,
  status: tasks.status,
  due: tasks.commitmentDate,
  projectName: projects.name,
  tramo: workflows.key,
};

/**
 * Open tasks per staff id, each task once per person: tasks the person is
 * responsable of plus tasks they support. One statement (Query Migration 6):
 * the support rows of the asked staff are joined in, so a task comes back
 * once per supporter and counts for its responsable too.
 */
export async function listAssignedOpenTasks(
  staffIds: string[],
  options: { includeAdmin: boolean }
): Promise<Map<string, AssignedOpenTask[]>> {
  const out = new Map<string, AssignedOpenTask[]>(staffIds.map((id) => [id, []]));
  if (staffIds.length === 0) return out;

  const rows = await db
    .select({ ...taskColumns, managerId: tasks.managerId, supportId: taskSupport.staffId })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(taskSupport, and(eq(taskSupport.taskId, tasks.id), inArray(taskSupport.staffId, staffIds)))
    .where(
      and(
        or(inArray(tasks.managerId, staffIds), isNotNull(taskSupport.staffId)),
        openTaskConditions(options.includeAdmin)
      )
    );

  const seen = new Set<string>();
  const add = (staffId: string | null, row: (typeof rows)[number]) => {
    if (!staffId || !out.has(staffId)) return;
    const key = `${staffId}:${row.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.get(staffId)!.push({
      staffId,
      id: row.id,
      title: row.title,
      status: row.status,
      due: row.due,
      projectName: row.projectName,
      tramo: row.tramo ?? null,
    });
  };
  // Responsable first, then support, as two reads used to return them.
  for (const row of rows) add(row.managerId, row);
  for (const row of rows) add(row.supportId, row);
  return out;
}

const ROLE_RANK: Record<StaffProjectRole, number> = { responsable: 0, coordinador: 1, miembro: 2 };

/**
 * Live projects in status `activo` per staff id, with the person's strongest
 * role on each (responsable > coordinador > miembro), by project name. One
 * statement (Query Migration 6): the memberships of the asked staff are
 * joined in and the roles are read from each row.
 */
export async function listActiveProjectsByStaff(staffIds: string[]): Promise<Map<string, StaffActiveProject[]>> {
  const out = new Map<string, StaffActiveProject[]>(staffIds.map((id) => [id, []]));
  if (staffIds.length === 0) return out;

  const live = and(isNull(projects.deletedAt), eq(projects.status, "activo"));
  const columns = { projectId: projects.id, name: projects.name, progress: projects.progress };

  const rows = await db
    .select({
      ...columns,
      managerId: projects.managerId,
      coordinatorId: projects.coordinatorId,
      memberId: projectMembers.staffId,
    })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), inArray(projectMembers.staffId, staffIds)))
    .where(
      and(
        live,
        or(
          inArray(projects.managerId, staffIds),
          inArray(projects.coordinatorId, staffIds),
          isNotNull(projectMembers.staffId)
        )
      )
    );
  const wanted = new Set(staffIds);
  const asRole = (pick: (row: (typeof rows)[number]) => string | null) =>
    rows
      .map((row) => ({ ...row, staffId: pick(row) }))
      .filter((row) => row.staffId !== null && wanted.has(row.staffId));
  const asManager = asRole((row) => row.managerId);
  const asCoordinator = asRole((row) => row.coordinatorId);
  const asMember = asRole((row) => row.memberId);

  const byKey = new Map<string, StaffActiveProject>();
  const add = (
    rows: Array<{ staffId: string | null; projectId: string; name: string; progress: number }>,
    role: StaffProjectRole
  ) => {
    for (const row of rows) {
      if (!row.staffId) continue;
      const key = `${row.staffId}:${row.projectId}`;
      const prev = byKey.get(key);
      if (prev && ROLE_RANK[prev.role] <= ROLE_RANK[role]) continue;
      byKey.set(key, { staffId: row.staffId, projectId: row.projectId, name: row.name, progress: row.progress, role });
    }
  };
  add(asManager, "responsable");
  add(asCoordinator, "coordinador");
  add(asMember, "miembro");

  for (const project of byKey.values()) out.get(project.staffId)?.push(project);
  for (const list of out.values()) list.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return out;
}

/** Which of `staffIds` have a stored profile photo. */
export async function staffIdsWithPhoto(staffIds: string[]): Promise<Set<string>> {
  if (staffIds.length === 0) return new Set();
  const rows = await db
    .select({ staffId: staffPhotos.staffId })
    .from(staffPhotos)
    .where(inArray(staffPhotos.staffId, staffIds));
  return new Set(rows.map((row) => row.staffId));
}

/**
 * Events read per entity for "Actividad reciente": more than the 10 rows shown,
 * so the rows that collapse (one edit, several fields) still leave 10.
 */
const ACTIVITY_FETCH = 40;

/**
 * The newest history events `staffId` made on live tasks and live projects
 * (redesign BE §7.11), with the task title or project name, plus the names
 * of the custom statuses those events moved tasks to. Admin-task events and
 * admin-only project fields are left out unless `includeAdmin`.
 */
export async function listRecentActivity(
  staffId: string,
  options: { includeAdmin: boolean }
): Promise<{ rows: ActivityEventRow[]; customStatusNames: Map<string, string> }> {
  const columns = {
    id: historyEvents.id,
    entityId: historyEvents.entityId,
    kind: historyEvents.kind,
    field: historyEvents.field,
    afterValue: historyEvents.afterValue,
    comment: historyEvents.comment,
    eventAt: historyEvents.eventAt,
  };

  const [taskRows, projectRows] = await Promise.all([
    db
      .select({ ...columns, title: tasks.title, taskKind: tasks.kind })
      .from(historyEvents)
      .innerJoin(tasks, eq(tasks.id, historyEvents.entityId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(historyEvents.actorId, staffId),
          eq(historyEvents.entity, "task"),
          isNull(tasks.deletedAt),
          isNull(projects.deletedAt),
          options.includeAdmin ? undefined : ne(tasks.kind, "admin")
        )
      )
      .orderBy(desc(historyEvents.eventAt))
      .limit(ACTIVITY_FETCH),
    db
      .select({ ...columns, title: projects.name })
      .from(historyEvents)
      .innerJoin(projects, eq(projects.id, historyEvents.entityId))
      .where(
        and(
          eq(historyEvents.actorId, staffId),
          eq(historyEvents.entity, "project"),
          isNull(projects.deletedAt),
          options.includeAdmin
            ? undefined
            : or(isNull(historyEvents.field), notInArray(historyEvents.field, [...ADMIN_PROJECT_ACTIVITY_FIELDS]))
        )
      )
      .orderBy(desc(historyEvents.eventAt))
      .limit(ACTIVITY_FETCH),
  ]);

  const rows: ActivityEventRow[] = [
    ...taskRows.map(({ taskKind, ...row }) => ({ ...row, entity: "task" as const, adminTask: taskKind === "admin" })),
    ...projectRows.map((row) => ({ ...row, entity: "project" as const, adminTask: false })),
  ];

  const statusIds = [
    ...new Set(
      taskRows
        .filter((r) => r.field === "customStatusId" && r.afterValue && UUID_TEXT.test(r.afterValue))
        .map((r) => r.afterValue as string)
    ),
  ];
  const customStatusNames = new Map<string, string>();
  if (statusIds.length > 0) {
    const statuses = await db
      .select({ id: taskStatuses.id, name: taskStatuses.name })
      .from(taskStatuses)
      .where(inArray(taskStatuses.id, statusIds));
    for (const status of statuses) customStatusNames.set(status.id, status.name);
  }

  return { rows, customStatusNames };
}

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
