import "server-only";

import { and, asc, eq, ilike, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import { contacts, projectSpaces, projects, staff, taskStatuses, tasks, workflowPhases, workflows } from "@/lib/db/schema";
import { toTask } from "@/lib/repositories/tasks-repository";
import type {
  HistoryEvent,
  ProjectSpace,
  StaffRef,
  TaskAttachment,
  TaskChecklistItem,
  TaskDetail,
  TaskLink,
  TaskRef,
  WorkflowPhaseRef,
} from "@/lib/types/core";
import type { CatalogAssignableStaffOption } from "@/lib/types/catalog";

/**
 * Single-statement reads for the task sheet (Query Migration 4b, #956):
 * `loadTaskSheet` (`lib/loaders/tareas.ts`) stays within its query budget by
 * folding every per-task list into one statement as JSON subqueries. Each
 * function is exactly one SQL statement and returns unscoped data: the loader
 * applies the viewer rules.
 *
 * Subqueries name the outer table literally (`staff.id`) where the statement
 * has no join: Drizzle leaves columns unqualified then, and an unqualified
 * `"id"` would bind to the subquery's own table.
 */

/** The timestamp as `Date#toISOString()` writes it (UTC, milliseconds, `Z`). */
const isoAt = (column: string) => `to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** postgres.js hands json columns back parsed or as text depending on the type parsers in use. */
function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

type AttachmentJson = Omit<TaskAttachment, "uploadedBy"> & { uploadedById: string | null; uploadedByName: string | null };

/** A task's detail plus the active fases of its etapa (the Fase select). */
export type TaskSheetDetail = { task: TaskDetail; phases: WorkflowPhaseRef[] };

/**
 * The task's `TaskDetail` (the shape `getTask` returns, archived tasks
 * included) and its etapa's active fases, in one statement. Null when the
 * task or its project is missing or deleted. Unscoped: any kind, client name
 * included.
 */
export async function getTaskSheetDetail(id: string): Promise<TaskSheetDetail | null> {
  const manager = alias(staff, "sheet_manager");
  const creator = alias(staff, "sheet_creator");
  const parent = alias(tasks, "sheet_parent");
  const [row] = await db
    .select({
      task: tasks,
      projectName: projects.name,
      clientName: contacts.name,
      workflowKey: workflows.key,
      workflowName: workflows.name,
      workflowSortOrder: workflows.sortOrder,
      phaseName: workflowPhases.name,
      phaseSortOrder: workflowPhases.sortOrder,
      spaceName: projectSpaces.name,
      managerName: manager.name,
      creatorId: creator.id,
      creatorName: creator.name,
      customStatusName: taskStatuses.name,
      customStatusCloses: taskStatuses.closes,
      customStatusCountsAsCompleted: taskStatuses.countsAsCompleted,
      // A deleted parent reads as no parent title ("Tarea padre eliminada").
      parentTitle: parent.title,
      subtaskCount: sql<number>`(select count(*)::int from core.tasks st
        where st.parent_task_id = ${tasks.id} and st.deleted_at is null and st.archived = false)`,
      subtaskDoneCount: sql<number>`(select count(*)::int from core.tasks st
        where st.parent_task_id = ${tasks.id} and st.deleted_at is null and st.archived = false
          and st.status = 'completado')`,
      // Open dependencies only: completado, deleted and archived ones don't count.
      waitingOn: sql<number>`(select count(*)::int from core.task_dependencies td
        join core.tasks dt on dt.id = td.depends_on_task_id
        where td.task_id = ${tasks.id} and dt.deleted_at is null and dt.archived = false and dt.status <> 'completado')`,
      support: sql<unknown>`(select coalesce(json_agg(json_build_object('id', ss.id, 'name', ss.name) order by ss.name asc), '[]'::json)
        from core.task_support ts join core.staff ss on ss.id = ts.staff_id
        where ts.task_id = ${tasks.id} and ss.deleted_at is null)`,
      checklist: sql<unknown>`(select coalesce(json_agg(json_build_object(
          'id', ci.id, 'title', ci.title, 'completed', ci.completed, 'sortOrder', ci.sort_order
        ) order by ci.sort_order asc), '[]'::json)
        from core.task_checklist_items ci where ci.task_id = ${tasks.id})`,
      attachments: sql<unknown>`(select coalesce(json_agg(json_build_object(
          'id', ta.id, 'taskId', ta.task_id, 'fileName', ta.file_name, 'mimeType', ta.mime_type,
          'sizeBytes', ta.size_bytes, 'uploadedById', ta.uploaded_by_id, 'uploadedByName', tu.name,
          'checklistItemId', ta.checklist_item_id, 'createdAt', ${sql.raw(isoAt("ta.created_at"))}
        ) order by ta.created_at asc), '[]'::json)
        from core.task_attachments ta left join core.staff tu on tu.id = ta.uploaded_by_id
        where ta.task_id = ${tasks.id})`,
      links: sql<unknown>`(select coalesce(json_agg(json_build_object(
          'id', tl.id, 'taskId', tl.task_id, 'kind', tl.kind, 'title', tl.title, 'url', tl.url,
          'createdAt', ${sql.raw(isoAt("tl.created_at"))}
        ) order by tl.created_at asc), '[]'::json)
        from core.task_links tl where tl.task_id = ${tasks.id})`,
      // Newest first, the latest 200 (as `listHistory`).
      history: sql<unknown>`(select coalesce(json_agg(he.event order by he.event_at desc), '[]'::json) from (
          select ev.event_at, json_build_object(
            'id', ev.id, 'entity', ev.entity, 'entityId', ev.entity_id, 'kind', ev.kind,
            'actor', case when ea.id is null then null else json_build_object('id', ea.id, 'name', ea.name) end,
            'field', ev.field, 'beforeValue', ev.before_value, 'afterValue', ev.after_value,
            'comment', ev.comment, 'eventAt', ${sql.raw(isoAt("ev.event_at"))}
          ) as event
          from core.history_events ev left join core.staff ea on ea.id = ev.actor_id
          where ev.entity = 'task' and ev.entity_id = ${tasks.id}
          order by ev.event_at desc
          limit 200
        ) he)`,
      phases: sql<unknown>`(select coalesce(json_agg(json_build_object(
          'id', wp.id, 'name', wp.name, 'sortOrder', wp.sort_order
        ) order by wp.sort_order asc), '[]'::json)
        from core.workflow_phases wp where wp.workflow_id = ${tasks.workflowId} and wp.active = true)`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(contacts, eq(contacts.id, projects.clientId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(projectSpaces, eq(projectSpaces.id, tasks.spaceId))
    .leftJoin(manager, eq(manager.id, tasks.managerId))
    .leftJoin(creator, eq(creator.id, tasks.createdById))
    .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
    .leftJoin(parent, and(eq(parent.id, tasks.parentTaskId), isNull(parent.deletedAt)))
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt), isNull(projects.deletedAt)))
    .limit(1);
  if (!row) return null;

  const t = row.task;
  const checklistItems = json<TaskChecklistItem[]>(row.checklist, []);
  const attachments = json<AttachmentJson[]>(row.attachments, []).map(
    ({ uploadedById, uploadedByName, ...rest }): TaskAttachment => ({
      ...rest,
      uploadedBy: uploadedById ? { id: uploadedById, name: uploadedByName ?? "" } : null,
    }),
  );
  const task: TaskDetail = {
    ...toTask(t),
    customStatus:
      t.customStatusId && row.customStatusName
        ? {
            id: t.customStatusId,
            name: row.customStatusName,
            closes: Boolean(row.customStatusCloses),
            countsAsCompleted: Boolean(row.customStatusCountsAsCompleted),
          }
        : null,
    project: { id: t.projectId, name: row.projectName, clientName: row.clientName ?? null },
    workflow:
      t.workflowId && row.workflowKey !== null && row.workflowName !== null && row.workflowSortOrder !== null
        ? { id: t.workflowId, key: row.workflowKey, name: row.workflowName, sortOrder: row.workflowSortOrder }
        : null,
    phase:
      t.phaseId && row.phaseName !== null && row.phaseSortOrder !== null
        ? { id: t.phaseId, name: row.phaseName, sortOrder: row.phaseSortOrder }
        : null,
    space: t.spaceId && row.spaceName !== null ? { id: t.spaceId, name: row.spaceName } : null,
    manager: t.managerId ? { id: t.managerId, name: row.managerName ?? "" } : null,
    support: json<StaffRef[]>(row.support, []).map((p) => ({ id: p.id, name: p.name })),
    checklist: { total: checklistItems.length, completed: checklistItems.filter((i) => i.completed).length },
    parentTaskId: t.parentTaskId,
    parentTitle: t.parentTaskId ? (row.parentTitle ?? null) : null,
    subtaskCount: Number(row.subtaskCount),
    subtaskDoneCount: Number(row.subtaskDoneCount),
    waitingOn: Number(row.waitingOn),
    createdBy: row.creatorId ? { id: row.creatorId, name: row.creatorName ?? "" } : { id: t.createdById, name: "" },
    checklistItems,
    attachments,
    links: json<TaskLink[]>(row.links, []),
    history: json<HistoryEvent[]>(row.history, []),
  };
  return { task, phases: t.workflowId ? json<WorkflowPhaseRef[]>(row.phases, []) : [] };
}

/**
 * Staff who can take a task, as `catalog.assignableStaff(workflowId)` holds
 * them (`loadCatalogAssignableStaff`): active, live, display name, the ones
 * whose puesto covers the etapa first, then by first name. One statement.
 */
export async function listAssignableStaffOptions(workflowId: string | null): Promise<CatalogAssignableStaffOption[]> {
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      lastName: staff.lastName,
      suggested: workflowId
        ? sql<boolean>`exists (select 1 from core.staff_positions sp
            join core.positions po on po.id = sp.position_id
            join core.position_phases pp on pp.position_id = po.id
            join core.workflow_phases pw on pw.id = pp.phase_id
            where sp.staff_id = staff.id and pw.workflow_id = ${workflowId} and pw.active = true
              and po.deleted_at is null and po.active = true)`
        : sql<boolean>`false`,
    })
    .from(staff)
    .where(and(isNull(staff.deletedAt), eq(staff.active, true)))
    .orderBy(sql`${staff.sortOrder} is null`, asc(staff.sortOrder), asc(staff.name));
  const options = rows.map((r) => ({
    id: r.id,
    name: [r.name, r.lastName].filter(Boolean).join(" "),
    firstName: r.name,
    suggested: Boolean(r.suggested),
  }));
  // `listAssignableStaff` re-sorts only when there is an etapa.
  if (workflowId) {
    options.sort((a, b) => Number(b.suggested) - Number(a.suggested) || a.firstName.localeCompare(b.firstName));
  }
  return options.map(({ id, name, suggested }) => ({ id, name, suggested }));
}

/** A project's espacios by `sortOrder`, with live task counts (`listSpaces`), in one statement. */
export async function listProjectSpacesWithCounts(projectId: string): Promise<ProjectSpace[]> {
  const rows = await db
    .select({
      id: projectSpaces.id,
      name: projectSpaces.name,
      projectId: projectSpaces.projectId,
      sortOrder: projectSpaces.sortOrder,
      taskCount: sql<number>`(select count(*)::int from core.tasks sc
        where sc.space_id = project_spaces.id and sc.deleted_at is null)`,
    })
    .from(projectSpaces)
    .where(eq(projectSpaces.projectId, projectId))
    .orderBy(asc(projectSpaces.sortOrder), asc(projectSpaces.name));
  return rows.map((r) => ({ ...r, taskCount: Number(r.taskCount) }));
}

/** `q` as an `ilike` pattern that matches it literally anywhere in the text. */
function containsPattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The dependency picker's search (`searchProjectTasksAction`): live,
 * unarchived tasks of one live project whose title contains `q`
 * (case-insensitive), as `TaskRef`, by title, at most `limit`. Admin tasks
 * are never returned, as with the project task list (`fetchTasksAction`) the
 * picker used before. `excludeId` leaves one task out.
 */
export async function searchProjectTasks(
  projectId: string,
  q: string,
  limit: number,
  excludeId?: string,
): Promise<TaskRef[]> {
  const term = q.trim();
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      managerName: staff.name,
      commitmentDate: tasks.commitmentDate,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(staff, eq(staff.id, tasks.managerId))
    .where(
      and(
        eq(tasks.projectId, projectId),
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt),
        eq(tasks.archived, false),
        ne(tasks.kind, "admin"),
        excludeId ? ne(tasks.id, excludeId) : undefined,
        term ? ilike(tasks.title, containsPattern(term)) : undefined,
      ),
    )
    .orderBy(asc(tasks.title), asc(tasks.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    managerName: r.managerName ?? null,
    commitmentDate: r.commitmentDate ?? null,
  }));
}
