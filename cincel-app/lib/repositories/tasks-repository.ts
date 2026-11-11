import { and, asc, desc, eq, getTableColumns, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import {
  contacts,
  historyEvents,
  projectSpaces,
  projects,
  staff,
  taskAttachments,
  taskChecklistItems,
  taskDependencies,
  taskLinks,
  taskStatuses,
  taskSupport,
  tasks,
  workflowPhases,
  workflows,
} from "@/lib/db/schema";
import { closedAtPatch } from "@/lib/project-flow/closing";
import { TASK_TRAMO_CHANGE_FORBIDDEN, flowError } from "@/lib/project-flow/errors";
import { completionsFromStatusEvents } from "@/lib/dashboard/task-trend";
import { assertAdminAssignees, todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import type { AdminTaskFilters } from "@/lib/validation/project-flow";
import { listHistory, recordChanges, recordComment } from "@/lib/repositories/history-repository";
import { assertSpaceInProject } from "@/lib/repositories/project-spaces-repository";
import { assertPhaseInWorkflow } from "@/lib/repositories/workflow-phases-repository";
import { underlyingStatus } from "@/lib/repositories/task-statuses-repository";
import { UNSCOPED_VIEWER, scopeTaskDto } from "@/lib/auth/viewer-scope";
import { normalizeTaskLinkUrl } from "@/lib/tasks/task-links";
import {
  EMPTY_SUMMARY_COUNTS,
  SIN_TRAMO_LABEL,
  SIN_TRAMO_SORT,
  compareSummaryProjects,
  compareSummaryTramos,
  type TareasSummary,
  type TareasSummaryCounts,
  type TareasSummaryProject,
  type TareasSummaryUnfilteredProject,
  summaryTramoKey,
} from "@/lib/tareas/summary";
import type {
  AdminTaskInput,
  HistoryEvent,
  StaffRef,
  Task,
  TaskAttachment,
  TaskChecklistItem,
  TaskDetail,
  TaskFilters,
  TaskKind,
  TaskLink,
  TaskLinkInput,
  TaskListItem,
  TaskListRow,
  TaskPatch,
  TaskRef,
  TaskStatus,
  SubtaskInput,
  UserTaskInput,
  ViewerScope,
} from "@/lib/types/core";

type TaskRow = typeof tasks.$inferSelect;

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    templateId: row.templateId,
    workflowId: row.workflowId,
    phaseId: row.phaseId,
    spaceId: row.spaceId,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    title: row.title,
    notes: row.notes,
    createdById: row.createdById,
    managerId: row.managerId,
    status: row.status,
    customStatusId: row.customStatusId,
    priority: row.priority,
    sortOrder: row.sortOrder,
    commitmentDate: row.commitmentDate,
    reviewDate: row.reviewDate,
    deliveryDate: row.deliveryDate,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toChecklistItem(row: typeof taskChecklistItems.$inferSelect): TaskChecklistItem {
  return { id: row.id, title: row.title, completed: row.completed, sortOrder: row.sortOrder };
}

const ALLOWED_ATTACHMENT_MIME = /^image\/|^text\/plain$/;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function toAttachment(row: {
  id: string;
  taskId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  uploadedById: string | null;
  uploadedByName: string | null;
  checklistItemId: string | null;
}): TaskAttachment {
  return {
    id: row.id,
    taskId: row.taskId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedById ? { id: row.uploadedById, name: row.uploadedByName ?? "" } : null,
    checklistItemId: row.checklistItemId,
    createdAt: row.createdAt.toISOString(),
  };
}

async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const rows = await db
    .select({
      id: taskAttachments.id,
      taskId: taskAttachments.taskId,
      fileName: taskAttachments.fileName,
      mimeType: taskAttachments.mimeType,
      sizeBytes: taskAttachments.sizeBytes,
      createdAt: taskAttachments.createdAt,
      uploadedById: taskAttachments.uploadedById,
      uploadedByName: staff.name,
      checklistItemId: taskAttachments.checklistItemId,
    })
    .from(taskAttachments)
    .leftJoin(staff, eq(staff.id, taskAttachments.uploadedById))
    .where(eq(taskAttachments.taskId, taskId))
    .orderBy(asc(taskAttachments.createdAt));
  return rows.map(toAttachment);
}

/**
 * Attaches a file to a task as a comment (#425): validates type/size, stores
 * the bytes, and — matching how a plain-text comment is recorded — logs a
 * "comentario" history entry so it shows in the task's timeline.
 */
export async function addTaskAttachment(
  taskId: string,
  file: { name: string; mimeType: string; data: Buffer },
  actorId: string,
  checklistItemId: string | null = null
): Promise<TaskAttachment> {
  if (!ALLOWED_ATTACHMENT_MIME.test(file.mimeType)) {
    throw new Error("TASK_ATTACHMENT_TYPE_NOT_ALLOWED");
  }
  if (file.data.byteLength === 0 || file.data.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("TASK_ATTACHMENT_TOO_LARGE");
  }

  let checklistItemTitle: string | null = null;
  if (checklistItemId) {
    // A checklist photo must be an image and belong to this same task.
    if (!file.mimeType.startsWith("image/")) throw new Error("TASK_ATTACHMENT_TYPE_NOT_ALLOWED");
    const [item] = await db
      .select({ title: taskChecklistItems.title })
      .from(taskChecklistItems)
      .where(and(eq(taskChecklistItems.id, checklistItemId), eq(taskChecklistItems.taskId, taskId)))
      .limit(1);
    if (!item) throw new Error("CHECKLIST_ITEM_NOT_FOUND");
    checklistItemTitle = item.title;
  }

  const [row] = await db
    .insert(taskAttachments)
    .values({
      taskId,
      fileName: file.name.slice(0, 255) || "archivo",
      mimeType: file.mimeType,
      sizeBytes: file.data.byteLength,
      data: file.data,
      uploadedById: actorId,
      checklistItemId,
    })
    .returning();

  await recordComment({
    entity: "task",
    entityId: taskId,
    actorId,
    comment: checklistItemTitle
      ? `Adjuntó una foto al punto "${checklistItemTitle}": ${row.fileName}`
      : `Adjuntó un archivo: ${row.fileName}`,
  });

  const [uploader] = await db.select({ name: staff.name }).from(staff).where(eq(staff.id, actorId));
  return toAttachment({ ...row, uploadedByName: uploader?.name ?? null });
}

/** File bytes for the download route — kept out of every other query so list views never load them. */
export async function getTaskAttachmentData(
  id: string
): Promise<{ taskId: string; fileName: string; mimeType: string; data: Buffer } | null> {
  const [row] = await db
    .select({
      taskId: taskAttachments.taskId,
      fileName: taskAttachments.fileName,
      mimeType: taskAttachments.mimeType,
      data: taskAttachments.data,
    })
    .from(taskAttachments)
    .where(eq(taskAttachments.id, id))
    .limit(1);
  return row ?? null;
}

function toTaskLink(row: typeof taskLinks.$inferSelect): TaskLink {
  return {
    id: row.id,
    taskId: row.taskId,
    kind: row.kind as TaskLink["kind"],
    title: row.title,
    url: row.url,
    createdAt: row.createdAt.toISOString(),
  };
}

async function listTaskLinks(taskId: string): Promise<TaskLink[]> {
  const rows = await db.select().from(taskLinks).where(eq(taskLinks.taskId, taskId)).orderBy(asc(taskLinks.createdAt));
  return rows.map(toTaskLink);
}

const TASK_LINK_KIND_LABEL = { interno: "interno", cliente: "del cliente" } as const;

export async function addTaskLink(taskId: string, input: TaskLinkInput, actorId: string): Promise<TaskLink> {
  const title = input.title.trim();
  if (!title) throw new Error("TASK_LINK_TITLE_REQUIRED");
  const url = normalizeTaskLinkUrl(input.url);
  if (!url) throw new Error("TASK_LINK_URL_INVALID");
  if (input.kind !== "interno" && input.kind !== "cliente") throw new Error("TASK_LINK_KIND_INVALID");

  await loadLiveTask(taskId);
  const [row] = await db.insert(taskLinks).values({ taskId, kind: input.kind, title, url, createdById: actorId }).returning();
  await recordComment({
    entity: "task",
    entityId: taskId,
    actorId,
    comment: `Agregó un enlace ${TASK_LINK_KIND_LABEL[input.kind]}: ${title}`,
  });
  return toTaskLink(row);
}

export async function removeTaskLink(id: string, actorId: string): Promise<void> {
  const [row] = await db.delete(taskLinks).where(eq(taskLinks.id, id)).returning();
  if (!row) return;
  await recordComment({
    entity: "task",
    entityId: row.taskId,
    actorId,
    comment: `Quitó un enlace ${TASK_LINK_KIND_LABEL[row.kind as TaskLink["kind"]]}: ${row.title}`,
  });
}

const TASK_TRACKED_FIELDS = [
  "title",
  "notes",
  "phaseId",
  "spaceId",
  "workflowId",
  "managerId",
  "status",
  "customStatusId",
  "priority",
  "commitmentDate",
  "reviewDate",
  "deliveryDate",
  "archived",
] as const;

async function loadSupport(taskIds: string[]): Promise<Map<string, StaffRef[]>> {
  const out = new Map<string, StaffRef[]>();
  if (taskIds.length === 0) return out;
  const rows = await db
    .select({ taskId: taskSupport.taskId, id: staff.id, name: staff.name })
    .from(taskSupport)
    .innerJoin(staff, eq(staff.id, taskSupport.staffId))
    .where(and(inArray(taskSupport.taskId, taskIds), isNull(staff.deletedAt)))
    .orderBy(asc(staff.name));
  for (const r of rows) {
    const list = out.get(r.taskId) ?? [];
    list.push({ id: r.id, name: r.name });
    out.set(r.taskId, list);
  }
  return out;
}

/**
 * The kind condition (BE §8.6): admin tasks are left out unless asked for,
 * and only an administrator viewer can ask. A non-admin asking only for admin
 * tasks gets nothing.
 */
function kindCondition(kind: TaskFilters["kind"], viewer: ViewerScope) {
  const asked = kind ? (Array.isArray(kind) ? kind : [kind]) : [];
  const kinds = viewer.isAdmin ? asked : asked.filter((k) => k !== "admin");
  if (kinds.length > 0) return inArray(tasks.kind, kinds);
  if (asked.length > 0) return sql`false`;
  return ne(tasks.kind, "admin");
}

/** Today in the org time zone (America/Mexico_City), or the given `YYYY-MM-DD`. */
function todaySql(today?: string): SQL {
  return today ? sql`${today}::date` : sql`(now() at time zone 'America/Mexico_City')::date`;
}

/** A task's due date (`taskDueDate`): commitment, then delivery. */
function taskDueSql(): SQL {
  return sql`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})`;
}

/**
 * Open: not completado and not in a live custom status that closes. A
 * subquery, so it holds whatever the statement joins.
 */
function openTaskSql(): SQL {
  return sql`(${tasks.status} <> 'completado' and not exists (select 1 from core.task_statuses ts_open where ts_open.id = ${tasks.customStatusId} and ts_open.deleted_at is null and ts_open.closes))`;
}

/** Open and due before today. */
function overdueTaskSql(today?: string): SQL {
  return sql`(${openTaskSql()} and ${taskDueSql()} < ${todaySql(today)})`;
}

/** The Tareas "Mostrar" filter: abiertas = open; en_retraso = open and overdue. */
function mostrarCondition(mostrar: TaskFilters["mostrar"], today?: string): SQL | undefined {
  if (mostrar === "abiertas") return openTaskSql();
  if (mostrar === "en_retraso") return overdueTaskSql(today);
  return undefined;
}

function whereFilters(f: TaskFilters, viewer: ViewerScope) {
  const statuses = f.status ? (Array.isArray(f.status) ? f.status : [f.status]) : undefined;
  return and(
    isNull(tasks.deletedAt),
    isNull(projects.deletedAt),
    f.archived === undefined ? eq(tasks.archived, false) : eq(tasks.archived, f.archived),
    f.projectId ? eq(tasks.projectId, f.projectId) : undefined,
    f.workflowId ? eq(tasks.workflowId, f.workflowId) : undefined,
    f.withoutWorkflow ? isNull(tasks.workflowId) : undefined,
    f.phaseId ? eq(tasks.phaseId, f.phaseId) : undefined,
    f.spaceId ? eq(tasks.spaceId, f.spaceId) : undefined,
    kindCondition(f.kind, viewer),
    statuses && statuses.length > 0 ? inArray(tasks.status, statuses) : undefined,
    f.managerId ? eq(tasks.managerId, f.managerId) : undefined,
    f.involvesStaffId
      ? or(
          eq(tasks.managerId, f.involvesStaffId),
          sql`exists (select 1 from core.task_support ts where ts.task_id = ${tasks.id} and ts.staff_id = ${f.involvesStaffId})`
        )
      : undefined,
    f.dateFrom
      ? or(gte(tasks.commitmentDate, f.dateFrom), gte(tasks.reviewDate, f.dateFrom), gte(tasks.deliveryDate, f.dateFrom))
      : undefined,
    f.dateTo
      ? or(lte(tasks.commitmentDate, f.dateTo), lte(tasks.reviewDate, f.dateTo), lte(tasks.deliveryDate, f.dateTo))
      : undefined,
    f.search ? searchMatch(f.search) : undefined,
    mostrarCondition(f.mostrar, f.today)
  );
}

/** Title, fase name or espacio name (listTasks joins both). */
function searchMatch(search: string) {
  const pattern = "%" + search.trim() + "%";
  return or(
    sql`${tasks.title} ilike ${pattern}`,
    sql`${workflowPhases.name} ilike ${pattern}`,
    sql`${projectSpaces.name} ilike ${pattern}`
  );
}

/**
 * Per-task aggregates as grouped derived tables, LEFT JOINed on the task id
 * (one statement, no correlated subqueries). Built per call: the subqueries
 * hang off `db`.
 */
function taskAggregates() {
  const subtask = alias(tasks, "subtask");
  const dependency = alias(tasks, "dependency");
  const checklist = db
    .select({
      taskId: taskChecklistItems.taskId,
      total: sql<number>`count(*)::int`.as("checklist_total"),
      done: sql<number>`(count(*) filter (where ${taskChecklistItems.completed}))::int`.as("checklist_done"),
    })
    .from(taskChecklistItems)
    .groupBy(taskChecklistItems.taskId)
    .as("checklist_agg");
  // Live children only: deleted and archived subtasks don't count.
  const subtasks = db
    .select({
      taskId: subtask.parentTaskId,
      total: sql<number>`count(*)::int`.as("subtask_total"),
      done: sql<number>`(count(*) filter (where ${subtask.status} = 'completado'))::int`.as("subtask_done"),
    })
    .from(subtask)
    .where(and(isNull(subtask.deletedAt), eq(subtask.archived, false), sql`${subtask.parentTaskId} is not null`))
    .groupBy(subtask.parentTaskId)
    .as("subtask_agg");
  // Open dependencies only: completado, deleted and archived ones don't count.
  const dependencies = db
    .select({ taskId: taskDependencies.taskId, open: sql<number>`count(*)::int`.as("waiting_on") })
    .from(taskDependencies)
    .innerJoin(dependency, eq(dependency.id, taskDependencies.dependsOnTaskId))
    .where(and(isNull(dependency.deletedAt), eq(dependency.archived, false), ne(dependency.status, "completado")))
    .groupBy(taskDependencies.taskId)
    .as("dependency_agg");
  const support = db
    .select({
      taskId: taskSupport.taskId,
      people: sql<StaffRef[] | string>`json_agg(json_build_object('id', ${staff.id}, 'name', ${staff.name}) order by ${staff.name} asc)`.as(
        "support_people"
      ),
    })
    .from(taskSupport)
    .innerJoin(staff, eq(staff.id, taskSupport.staffId))
    .where(isNull(staff.deletedAt))
    .groupBy(taskSupport.taskId)
    .as("support_agg");
  const comments = db
    .select({ taskId: historyEvents.entityId, total: sql<number>`count(*)::int`.as("comment_total") })
    .from(historyEvents)
    .where(and(eq(historyEvents.entity, "task"), eq(historyEvents.kind, "comentario")))
    .groupBy(historyEvents.entityId)
    .as("comment_agg");
  const attachments = db
    .select({ taskId: taskAttachments.taskId, total: sql<number>`count(*)::int`.as("attachment_total") })
    .from(taskAttachments)
    .groupBy(taskAttachments.taskId)
    .as("attachment_agg");
  return { checklist, subtasks, dependencies, support, comments, attachments };
}

const countOf = (column: SQLWrapper) => sql<number>`coalesce(${column}, 0)::int`;

/** A copy without the large `notes` field (slim list rows). */
function withoutNotes<T extends { notes: unknown }>(value: T): Omit<T, "notes"> {
  const out: Partial<T> = { ...value };
  delete out.notes;
  return out as Omit<T, "notes">;
}

/**
 * Extra parts of a paged task list statement (`listTasksPage`,
 * `listBoardColumns`): a condition (keyset, board column), the order, a row
 * limit, the whole-result count, and the ranked board subquery to join.
 */
type TaskListPageQuery = {
  where?: SQL;
  orderBy?: SQL[];
  limit?: number;
  /** Adds `count(*) over ()`: the rows matching before the limit. */
  withTotal?: boolean;
  /** Joins the board ranking and keeps the first `perColumn` rows of each column. */
  ranked?: { subquery: ReturnType<typeof rankedBoardSubquery>; perColumn: number };
};

/**
 * The task list statement shared by `listTasks`, `listTaskRows` and the paged
 * reads. `slim` leaves `notes` out and adds the comment and attachment counts.
 */
async function selectTaskList(filters: TaskFilters, viewer: ViewerScope, slim: boolean, page: TaskListPageQuery = {}) {
  const agg = taskAggregates();
  const parent = alias(tasks, "parent_task");
  const taskColumns = withoutNotes(getTableColumns(tasks));
  const ranked = page.ranked?.subquery;
  const query = db
    .select({
      task: taskColumns,
      notes: slim ? sql<string | null>`null` : tasks.notes,
      projectName: projects.name,
      clientName: contacts.name,
      workflowId: workflows.id,
      workflowKey: workflows.key,
      workflowName: workflows.name,
      workflowSortOrder: workflows.sortOrder,
      phaseName: workflowPhases.name,
      phaseSortOrder: workflowPhases.sortOrder,
      spaceName: projectSpaces.name,
      managerName: staff.name,
      customStatusName: taskStatuses.name,
      customStatusCloses: taskStatuses.closes,
      customStatusCountsAsCompleted: taskStatuses.countsAsCompleted,
      checklistTotal: countOf(agg.checklist.total),
      checklistDone: countOf(agg.checklist.done),
      // A deleted parent reads as no parent title ("Tarea padre eliminada").
      parentTitle: parent.title,
      subtaskCount: countOf(agg.subtasks.total),
      subtaskDoneCount: countOf(agg.subtasks.done),
      waitingOn: countOf(agg.dependencies.open),
      support: agg.support.people,
      commentCount: countOf(agg.comments.total),
      attachmentCount: countOf(agg.attachments.total),
      pageTotal: page.withTotal ? sql<number>`(count(*) over ())::int` : sql<number>`0`,
      columnKey: ranked ? sql<string | null>`${ranked.columnKey}` : sql<string | null>`null`,
      columnTotal: ranked ? sql<number>`${ranked.columnTotal}` : sql<number>`0`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    // A project's client is optional (project flow): a left join keeps its tasks.
    .leftJoin(contacts, eq(contacts.id, projects.clientId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(projectSpaces, eq(projectSpaces.id, tasks.spaceId))
    .leftJoin(staff, eq(staff.id, tasks.managerId))
    .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
    .leftJoin(parent, and(eq(parent.id, tasks.parentTaskId), isNull(parent.deletedAt)))
    .leftJoin(agg.checklist, eq(agg.checklist.taskId, tasks.id))
    .leftJoin(agg.subtasks, eq(agg.subtasks.taskId, tasks.id))
    .leftJoin(agg.dependencies, eq(agg.dependencies.taskId, tasks.id))
    .leftJoin(agg.support, eq(agg.support.taskId, tasks.id))
    // `listTasks` has no use for these two: a false join condition skips them.
    .leftJoin(agg.comments, slim ? eq(agg.comments.taskId, tasks.id) : sql`false`)
    .leftJoin(agg.attachments, slim ? eq(agg.attachments.taskId, tasks.id) : sql`false`)
    .$dynamic();
  if (ranked) query.innerJoin(ranked, eq(ranked.id, tasks.id));
  query
    .where(
      and(
        whereFilters(filters, viewer),
        page.where,
        page.ranked ? lte(page.ranked.subquery.rowNumber, page.ranked.perColumn) : undefined
      )
    )
    // Tramo, then fase, then manual order (BE §8.6); tasks without one go last.
    .orderBy(
      ...(page.orderBy ?? [
        sql`${workflows.sortOrder} asc nulls last`,
        sql`${workflowPhases.sortOrder} asc nulls last`,
        sql`${tasks.sortOrder} asc nulls last`,
        asc(tasks.commitmentDate),
        asc(tasks.title),
      ])
    );
  if (page.limit !== undefined) query.limit(page.limit);
  const rows = await query;

  return rows.map((r) => {
    const people = typeof r.support === "string" ? (JSON.parse(r.support) as StaffRef[]) : r.support;
    const item: TaskListItem = scopeTaskDto({
      ...toTask({ ...r.task, notes: r.notes }),
      customStatus:
        r.task.customStatusId && r.customStatusName
          ? {
              id: r.task.customStatusId,
              name: r.customStatusName,
              closes: Boolean(r.customStatusCloses),
              countsAsCompleted: Boolean(r.customStatusCountsAsCompleted),
            }
          : null,
      project: { id: r.task.projectId, name: r.projectName, clientName: r.clientName ?? null },
      workflow: r.workflowId
        ? { id: r.workflowId, key: r.workflowKey!, name: r.workflowName!, sortOrder: r.workflowSortOrder! }
        : null,
      phase: r.task.phaseId && r.phaseName ? { id: r.task.phaseId, name: r.phaseName, sortOrder: r.phaseSortOrder! } : null,
      space: r.task.spaceId && r.spaceName ? { id: r.task.spaceId, name: r.spaceName } : null,
      manager: r.task.managerId ? { id: r.task.managerId, name: r.managerName! } : null,
      support: (people ?? []).map((p) => ({ id: p.id, name: p.name })),
      checklist: { total: r.checklistTotal, completed: r.checklistDone },
      parentTaskId: r.task.parentTaskId,
      parentTitle: r.task.parentTaskId ? (r.parentTitle ?? null) : null,
      subtaskCount: r.subtaskCount,
      subtaskDoneCount: r.subtaskDoneCount,
      waitingOn: r.waitingOn,
    }, viewer);
    const sortKey: TaskPageSortKey = [
      r.workflowSortOrder ?? SORT_LAST,
      r.phaseSortOrder ?? SORT_LAST,
      r.task.sortOrder ?? SORT_LAST,
      r.task.commitmentDate ?? DATE_LAST,
      r.task.id,
    ];
    return {
      item,
      commentCount: r.commentCount,
      attachmentCount: r.attachmentCount,
      sortKey,
      pageTotal: Number(r.pageTotal),
      columnKey: r.columnKey,
      columnTotal: Number(r.columnTotal),
    };
  });
}

/** Task list rows for `viewer`: admin tasks and client names only for administrators (BE §8.6, §12). */
export async function listTasks(filters: TaskFilters, viewer: ViewerScope): Promise<TaskListItem[]> {
  return (await selectTaskList(filters, viewer, false)).map((r) => r.item);
}

/**
 * Slim list rows (`TaskListRow`): the `listTasks` rows and order without
 * `notes`, plus flat counts, in one statement (aggregate joins).
 */
export async function listTaskRows(filters: TaskFilters, viewer: ViewerScope): Promise<TaskListRow[]> {
  return (await selectTaskList(filters, viewer, true)).map(toTaskListRow);
}

/** A slim statement row → `TaskListRow`. */
function toTaskListRow({
  item,
  commentCount,
  attachmentCount,
}: {
  item: TaskListItem;
  commentCount: number;
  attachmentCount: number;
}): TaskListRow {
  return {
    ...withoutNotes(item),
    subtaskDone: item.subtaskDoneCount,
    commentCount,
    attachmentCount,
    checklistTotal: item.checklist.total,
    checklistDone: item.checklist.completed,
  };
}

// ── Paged reads (Query Migration 4a, #955) ──────────────────────────────────

/** Sorts after every real `sort_order` (nulls last). */
const SORT_LAST = 2147483647;
/** Sorts after every real date (nulls last). */
const DATE_LAST = "9999-12-31";

/** Keyset of the paged order: tramo, fase and manual order, commitment date, id. */
type TaskPageSortKey = [number, number, number, string, string];

/** The paged order's keys as SQL: the `selectTaskList` order with nulls last and `id` as the tie-break. */
function pageSortExpressions(): SQL[] {
  return [
    sql`coalesce(${workflows.sortOrder}, ${sql.raw(String(SORT_LAST))})`,
    sql`coalesce(${workflowPhases.sortOrder}, ${sql.raw(String(SORT_LAST))})`,
    sql`coalesce(${tasks.sortOrder}, ${sql.raw(String(SORT_LAST))})`,
    sql`coalesce(${tasks.commitmentDate}, ${sql.raw(`'${DATE_LAST}'::date`)})`,
    sql`${tasks.id}`,
  ];
}

const pageOrderBy = (): SQL[] => pageSortExpressions().map((e) => sql`${e} asc`);

/** Rows strictly after the cursor in the paged order. */
function afterCursor(key: TaskPageSortKey): SQL {
  const [w, p, s, d, id] = key;
  return sql`(${sql.join(pageSortExpressions(), sql`, `)}) > (${w}::int, ${p}::int, ${s}::int, ${d}::date, ${id}::uuid)`;
}

/** Opaque page cursor: the last row's sort key, base64url JSON. */
export function encodeTaskCursor(key: TaskPageSortKey): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A cursor from `encodeTaskCursor`; anything else is INVALID. */
export function decodeTaskCursor(cursor: string): TaskPageSortKey {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error("INVALID: cursor");
  }
  const ok =
    Array.isArray(value) &&
    value.length === 5 &&
    value.slice(0, 3).every((n) => Number.isInteger(n)) &&
    typeof value[3] === "string" &&
    ISO_DATE_RE.test(value[3]) &&
    typeof value[4] === "string" &&
    UUID_RE.test(value[4]);
  if (!ok) throw new Error("INVALID: cursor");
  return value as TaskPageSortKey;
}

/**
 * The board column a task sits in: `custom:<id>` for a live custom status,
 * else its base status (`statusSelectValue` on the client). Needs the
 * `task_statuses` join of the list statement.
 */
function boardColumnKey(): SQL<string> {
  return sql<string>`(case when ${taskStatuses.id} is not null then 'custom:' || ${taskStatuses.id}::text else ${tasks.status}::text end)`;
}

/**
 * Every matching task with its board column, its rank inside the column (in
 * the paged order) and the column's total, as a derived table. One window
 * pass: `row_number()` and `count(*)` over `PARTITION BY` the column.
 */
function rankedBoardSubquery(filters: TaskFilters, viewer: ViewerScope) {
  const column = boardColumnKey();
  return db
    .select({
      id: tasks.id,
      columnKey: sql<string>`${column}`.as("board_column"),
      rowNumber: sql<number>`(row_number() over (partition by ${column} order by ${sql.join(pageOrderBy(), sql`, `)}))::int`.as(
        "board_rank"
      ),
      columnTotal: sql<number>`(count(*) over (partition by ${column}))::int`.as("board_total"),
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(projectSpaces, eq(projectSpaces.id, tasks.spaceId))
    .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
    .where(whereFilters(filters, viewer))
    .as("board_ranked");
}

export type TaskRowsPage = { rows: TaskListRow[]; nextCursor: string | null; total: number };

// ── "retraso" order (Tareas Analítico, #988) ────────────────────────────────

/** Keyset of the "retraso" order: rank (0 overdue, 1 open, 2 closed), due date (nulls last), id. */
type TaskRetrasoSortKey = ["r", number, string, string];

/** The "retraso" order's keys as SQL: overdue first, then open, then closed; each by due date, then id. */
function retrasoSortExpressions(today?: string): SQL[] {
  return [
    sql`(case when ${overdueTaskSql(today)} then 0 when ${openTaskSql()} then 1 else 2 end)`,
    sql`coalesce(${taskDueSql()}, ${sql.raw(`'${DATE_LAST}'::date`)})`,
    sql`${tasks.id}`,
  ];
}

/** Rows strictly after the cursor in the "retraso" order. */
function afterRetrasoCursor(key: TaskRetrasoSortKey, today?: string): SQL {
  const [, rank, due, id] = key;
  return sql`(${sql.join(retrasoSortExpressions(today), sql`, `)}) > (${rank}::int, ${due}::date, ${id}::uuid)`;
}

/** The "retraso" sort key of a row, as the SQL computes it (`today` in the org time zone). */
function retrasoSortKey(row: TaskListItem, today: string): TaskRetrasoSortKey {
  const due = row.commitmentDate ?? row.deliveryDate ?? null;
  const closed = row.status === "completado" || Boolean(row.customStatus?.closes);
  const rank = closed ? 2 : due !== null && due < today ? 0 : 1;
  return ["r", rank, due ?? DATE_LAST, row.id];
}

/** A cursor of the "retraso" order; anything else is INVALID. */
function decodeRetrasoCursor(cursor: string): TaskRetrasoSortKey {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw new Error("INVALID: cursor");
  }
  const ok =
    Array.isArray(value) &&
    value.length === 4 &&
    value[0] === "r" &&
    Number.isInteger(value[1]) &&
    typeof value[2] === "string" &&
    ISO_DATE_RE.test(value[2]) &&
    typeof value[3] === "string" &&
    UUID_RE.test(value[3]);
  if (!ok) throw new Error("INVALID: cursor");
  return value as TaskRetrasoSortKey;
}

/**
 * One page of slim rows (`TaskListRow`) in a stable keyset order, with the
 * total that match the filters. `cursor` is the previous page's
 * `nextCursor`; null when there is no further page. Aggregates come from the
 * same statement, so only the page's tasks are read.
 *
 * `orderBy`:
 * - "tramo" (default): the board/list order (tramo, fase, manual order,
 *   commitment date, id; nulls last);
 * - "retraso" (Tareas Analítico): overdue tasks first by due date (most days
 *   late first), then the open ones by due date, then the closed ones; the
 *   due date is `coalesce(commitment, delivery)` and today is `filters.today`
 *   or today in America/Mexico_City.
 */
export async function listTasksPage(
  filters: TaskFilters,
  viewer: ViewerScope,
  opts: { cursor: string | null; limit: number; orderBy?: "tramo" | "retraso"; columnKey?: string }
): Promise<TaskRowsPage> {
  const limit = Math.max(1, Math.floor(opts.limit));
  const retraso = opts.orderBy === "retraso";
  const today = filters.today ?? todayInAppTimeZone();
  let after: SQL | undefined;
  if (opts.cursor) {
    after = retraso
      ? afterRetrasoCursor(decodeRetrasoCursor(opts.cursor), today)
      : afterCursor(decodeTaskCursor(opts.cursor));
  }
  // One "today" for the order and the Mostrar filter.
  const f: TaskFilters = retraso ? { ...filters, today } : filters;
  const rows = await selectTaskList(f, viewer, true, {
    where: and(after, opts.columnKey ? sql`${boardColumnKey()} = ${opts.columnKey}` : undefined),
    orderBy: retraso ? retrasoSortExpressions(today).map((e) => sql`${e} asc`) : pageOrderBy(),
    limit: limit + 1,
    withTotal: true,
  });
  const pageRows = rows.slice(0, limit);
  const last = pageRows.at(-1);
  // With a cursor, `count(*) over ()` counts only the rows after it: the total is the rows before plus those.
  let total = rows[0]?.pageTotal ?? 0;
  if (opts.cursor) total = await countTasksMatching(f, viewer, opts.columnKey);
  let nextCursor: string | null = null;
  if (rows.length > limit && last) {
    nextCursor = retraso
      ? Buffer.from(JSON.stringify(retrasoSortKey(last.item, today)), "utf8").toString("base64url")
      : encodeTaskCursor(last.sortKey);
  }
  return { rows: pageRows.map(toTaskListRow), nextCursor, total };
}

/** COUNT(*) of the tasks matching the filters (and the board column). */
async function countTasksMatching(filters: TaskFilters, viewer: ViewerScope, columnKey?: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(projectSpaces, eq(projectSpaces.id, tasks.spaceId))
    .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
    .where(and(whereFilters(filters, viewer), columnKey ? sql`${boardColumnKey()} = ${columnKey}` : undefined));
  return Number(row?.n ?? 0);
}

export type BoardColumnPage = { rows: TaskListRow[]; total: number; nextCursor: string | null };

/**
 * The board (#919): the first `perColumn` rows of every column with its
 * total, in one statement (`ROW_NUMBER() OVER (PARTITION BY column)`).
 * `columnKeys` are every column of the status catalog (the base statuses and
 * `custom:<id>` per configured custom status): each is present, with
 * `total: 0` and no rows when nothing matches. A column the catalog doesn't
 * list but a task sits in is added too. Open and closed tasks alike; archived
 * ones never (the default `archived: false`).
 */
export async function listBoardColumns(
  filters: TaskFilters,
  viewer: ViewerScope,
  perColumn: number,
  columnKeys: readonly string[] = ["pendiente", "en_proceso", "completado", "bloqueado"]
): Promise<Record<string, BoardColumnPage>> {
  const limit = Math.max(1, Math.floor(perColumn));
  const rows = await selectTaskList({ ...filters, archived: false }, viewer, true, {
    ranked: { subquery: rankedBoardSubquery({ ...filters, archived: false }, viewer), perColumn: limit + 1 },
    orderBy: pageOrderBy(),
  });
  const out: Record<string, BoardColumnPage> = {};
  for (const key of columnKeys) out[key] = { rows: [], total: 0, nextCursor: null };
  const byColumn = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.columnKey ?? r.item.status;
    const list = byColumn.get(key) ?? [];
    list.push(r);
    byColumn.set(key, list);
  }
  for (const [key, list] of byColumn) {
    const page = list.slice(0, limit);
    const last = page.at(-1);
    out[key] = {
      rows: page.map(toTaskListRow),
      total: list[0]?.columnTotal ?? 0,
      nextCursor: list.length > limit && last ? encodeTaskCursor(last.sortKey) : null,
    };
  }
  return out;
}

export type TaskFacets = {
  total: number;
  byTramo: Record<string, number>;
  projects: { id: string; name: string; count: number }[];
  /** "Mostrar" counts: the tasks in the selected tramo and project with each choice (they ignore `mostrar`). */
  mostrar?: { todas: number; abiertas: number; en_retraso: number };
  /** The tasks in that scope the viewer manages. */
  mine?: number;
};

/**
 * The Tareas chip counts and Proyecto options in one `GROUP BY workflow_id,
 * project_id`, from `filters` without their tramo and proyecto (so picking a
 * chip or a project never hides the other choices), exactly as the client
 * computed them from every task:
 * - `total` ("Todas") and `byTramo` (per tramo key): the tasks in the selected
 *   project (`scope.projectId`), any tramo;
 * - `projects`: the projects with tasks in the selected tramo
 *   (`scope.workflowKey`), any project, by name; the selected project is kept
 *   even when the tramo leaves it with no task.
 */
export async function taskFacets(
  filters: TaskFilters,
  viewer: ViewerScope,
  scope: { workflowKey: string | null; projectId: string | null } = { workflowKey: null, projectId: null }
): Promise<TaskFacets> {
  const base: TaskFilters = { ...filters, workflowId: undefined, projectId: undefined, mostrar: undefined };
  const shown = mostrarCondition(filters.mostrar, filters.today);
  const groups = await db
    .select({
      workflowKey: workflows.key,
      projectId: tasks.projectId,
      projectName: projects.name,
      count: shown ? sql<number>`(count(*) filter (where ${shown}))::int` : sql<number>`count(*)::int`,
      all: sql<number>`count(*)::int`,
      open: sql<number>`(count(*) filter (where ${openTaskSql()}))::int`,
      overdue: sql<number>`(count(*) filter (where ${overdueTaskSql(filters.today)}))::int`,
      mine: viewer.staffId
        ? sql<number>`(count(*) filter (where ${shown ?? sql`true`} and ${tasks.managerId} = ${viewer.staffId}))::int`
        : sql<number>`0`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(projectSpaces, eq(projectSpaces.id, tasks.spaceId))
    .where(whereFilters(base, viewer))
    .groupBy(tasks.workflowId, workflows.key, tasks.projectId, projects.name);

  let total = 0;
  let mine = 0;
  const byTramo: Record<string, number> = {};
  const mostrar = { todas: 0, abiertas: 0, en_retraso: 0 };
  const projectCounts = new Map<string, { id: string; name: string; count: number }>();
  for (const g of groups) {
    const count = Number(g.count);
    const inProject = scope.projectId === null || g.projectId === scope.projectId;
    const inTramo = scope.workflowKey === null || g.workflowKey === scope.workflowKey;
    if (inProject) {
      total += count;
      if (g.workflowKey) byTramo[g.workflowKey] = (byTramo[g.workflowKey] ?? 0) + count;
    }
    if (inProject && inTramo) {
      mostrar.todas += Number(g.all);
      mostrar.abiertas += Number(g.open);
      mostrar.en_retraso += Number(g.overdue);
      mine += Number(g.mine);
    }
    // A project the Mostrar choice leaves without tasks drops out of the options (the selected one stays).
    if ((inTramo && count > 0) || g.projectId === scope.projectId) {
      const entry = projectCounts.get(g.projectId) ?? { id: g.projectId, name: g.projectName, count: 0 };
      if (inTramo) entry.count += count;
      projectCounts.set(g.projectId, entry);
    }
  }
  const projectsOut = [...projectCounts.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { total, byTramo, projects: projectsOut, mostrar, mine };
}

/**
 * Open tasks `staffId` manages or supports, as `listMyTasks(staffId, {}, viewer)`
 * filtered by `isTaskClosed` would count them, with one COUNT(*).
 */
export async function countOpenTasksFor(staffId: string, viewer: ViewerScope): Promise<number> {
  const kind = viewer.isAdmin ? ALL_TASK_KINDS : undefined;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
    .where(
      and(
        whereFilters({ kind, involvesStaffId: staffId }, viewer),
        // isTaskClosed: completado, or a live custom status that closes.
        ne(tasks.status, "completado"),
        sql`coalesce(${taskStatuses.closes}, false) = false`
      )
    );
  return row?.n ?? 0;
}

/**
 * `listTasks({ projectId }, viewer).length` with one COUNT(*). `topLevel`
 * leaves subtasks out (the project tab shell's Tareas count).
 */
export async function countProjectTasks(
  projectId: string,
  viewer: ViewerScope,
  opts: { topLevel?: boolean } = {}
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(whereFilters({ projectId }, viewer), opts.topLevel ? isNull(tasks.parentTaskId) : undefined));
  return row?.n ?? 0;
}

/** Open admin tasks (or all with `includeClosed`), by commitment date then project name (BE §8.6). */
export async function listAdminTasks(filters: AdminTaskFilters = {}): Promise<TaskListItem[]> {
  // Administrators only: the action refuses everyone else before this runs.
  const rows = await listTasks({ kind: "admin", projectId: filters.projectId, archived: false }, UNSCOPED_VIEWER);
  const visible = filters.includeClosed ? rows : rows.filter((t) => !isClosedTask(t));
  return visible.sort(compareAdminTasks);
}

/** Closed: completado, or a custom status that closes (closing statuses keep `completado` underneath). */
function isClosedTask(t: TaskListItem): boolean {
  return t.status === "completado" || Boolean(t.customStatus?.closes);
}

/** By commitment date (no date last), then project name, then title. */
export function compareAdminTasks(
  a: Pick<TaskListItem, "commitmentDate" | "title" | "project">,
  b: Pick<TaskListItem, "commitmentDate" | "title" | "project">
): number {
  if (a.commitmentDate !== b.commitmentDate) {
    if (!a.commitmentDate) return 1;
    if (!b.commitmentDate) return -1;
    return a.commitmentDate < b.commitmentDate ? -1 : 1;
  }
  const byProject = a.project.name.localeCompare(b.project.name, "es");
  if (byProject !== 0) return byProject;
  return a.title.localeCompare(b.title, "es");
}

/** Manager plus support ids, without nulls or repeats. */
function assigneeIds(managerId: string | null | undefined, supportIds: readonly string[] | undefined): string[] {
  return [...new Set([...(managerId ? [managerId] : []), ...(supportIds ?? [])])];
}

/** ASSIGNEE_NOT_ADMIN unless every id is an administrator (BE §9.5). No-op for an empty list. */
async function requireAdminAssignees(staffIds: string[]): Promise<void> {
  if (staffIds.length === 0) return;
  await db.transaction((tx) => assertAdminAssignees(tx, staffIds));
}

/** A `kind = 'admin'` task; administrator assignees only (ASSIGNEE_NOT_ADMIN); NOT_FOUND (project). */
export async function createAdminTask(input: AdminTaskInput, actorId: string): Promise<TaskDetail> {
  return insertAdminTask(input, actorId, null);
}

async function insertAdminTask(
  input: AdminTaskInput,
  actorId: string,
  parentTaskId: string | null
): Promise<TaskDetail> {
  const title = input.title.trim();
  if (!title) throw new Error("TASK_TITLE_REQUIRED");
  const supportIds = [...new Set(input.supportIds ?? [])];

  const id = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, input.projectId), isNull(projects.deletedAt)))
      .limit(1);
    if (!project) throw flowError("NOT_FOUND");

    await assertAdminAssignees(tx, assigneeIds(input.managerId, supportIds));

    const [row] = await tx
      .insert(tasks)
      .values({
        projectId: input.projectId,
        parentTaskId,
        kind: "admin",
        templateId: null,
        workflowId: null,
        phaseId: null,
        spaceId: null,
        title,
        notes: clean(input.notes),
        createdById: actorId,
        managerId: input.managerId ?? null,
        priority: input.priority ?? "media",
        commitmentDate: clean(input.commitmentDate),
        reviewDate: clean(input.reviewDate),
        deliveryDate: clean(input.deliveryDate),
      })
      .returning({ id: tasks.id });

    if (supportIds.length > 0) {
      await tx.insert(taskSupport).values(supportIds.map((staffId) => ({ taskId: row.id, staffId })));
    }
    await recordChanges(
      {
        entity: "task",
        entityId: row.id,
        actorId,
        before: { created: null },
        after: { created: title },
        fields: ["created"],
      },
      tx
    );
    return row.id;
  });

  return (await getTask(id))!;
}

/**
 * Guard for task-scoped reads and writes (BE §12): an admin task is invisible
 * to non-admins. Throws FORBIDDEN for them (reads map it to null / []).
 */
export async function assertTaskVisible(taskId: string, viewer: ViewerScope): Promise<void> {
  if (viewer.isAdmin) return;
  const [row] = await db.select({ kind: tasks.kind }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  // A missing task is left to the caller's own NOT_FOUND handling.
  if (row?.kind === "admin") throw flowError("FORBIDDEN");
}

/** False when the task is an admin task and the viewer isn't admin (reads return null / [] then). */
export async function isTaskVisible(taskId: string, viewer: ViewerScope): Promise<boolean> {
  try {
    await assertTaskVisible(taskId, viewer);
    return true;
  } catch {
    return false;
  }
}

/** The task a checklist item belongs to, or null; lets the actions guard item-scoped calls. */
export async function checklistItemTaskId(itemId: string): Promise<string | null> {
  const [row] = await db
    .select({ taskId: taskChecklistItems.taskId })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.id, itemId))
    .limit(1);
  return row?.taskId ?? null;
}

/** The task a link belongs to, or null; lets the actions guard link-scoped calls. */
export async function taskLinkTaskId(linkId: string): Promise<string | null> {
  const [row] = await db.select({ taskId: taskLinks.taskId }).from(taskLinks).where(eq(taskLinks.id, linkId)).limit(1);
  return row?.taskId ?? null;
}

/**
 * Tasks where the staff member is manager or support (Mis tareas, calendar
 * feed, Google Calendar sync). An administrator also gets their own admin
 * tasks; nobody else gets any (BE §7.5, §8.8).
 */
export async function listMyTasks(staffId: string, filters: TaskFilters, viewer: ViewerScope): Promise<TaskListItem[]> {
  const kind = filters.kind ?? (viewer.isAdmin ? ALL_TASK_KINDS : undefined);
  return listTasks({ ...filters, kind, involvesStaffId: staffId }, viewer);
}

/** Every kind: getTask finds admin tasks too; the actions decide who may see them (BE §12). */
const ALL_TASK_KINDS: TaskKind[] = ["workflow", "usuario", "admin"];

/**
 * Unscoped detail (every kind, client name included), for mutation results:
 * the action guards the task with `assertTaskVisible` and scopes the DTO with
 * `scopeTaskDto`. Reads for a viewer go through `getTaskForViewer`.
 */
export async function getTask(id: string): Promise<TaskDetail | null> {
  const [item] = await listTasks({ archived: undefined, search: undefined, kind: ALL_TASK_KINDS }, UNSCOPED_VIEWER).then(
    (all) => all.filter((t) => t.id === id)
  );
  const base =
    item ??
    (await listTasks({ archived: true, kind: ALL_TASK_KINDS }, UNSCOPED_VIEWER).then((all) =>
      all.find((t) => t.id === id)
    ));
  if (!base) return null;

  const [creator] = await db
    .select({ id: staff.id, name: staff.name })
    .from(staff)
    .where(eq(staff.id, base.createdById));
  const checklist = await db
    .select()
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, id))
    .orderBy(asc(taskChecklistItems.sortOrder));
  const history = await listHistory("task", id);
  const attachments = await listTaskAttachments(id);
  const links = await listTaskLinks(id);

  return {
    ...base,
    createdBy: creator ?? { id: base.createdById, name: "" },
    checklistItems: checklist.map(toChecklistItem),
    attachments,
    links,
    history,
  };
}

/** Task detail for `viewer`: null for an admin task unless the viewer is admin; client name scoped (BE §7.5). */
export async function getTaskForViewer(id: string, viewer: ViewerScope): Promise<TaskDetail | null> {
  const detail = await getTask(id);
  if (!detail) return null;
  if (detail.kind === "admin" && !viewer.isAdmin) return null;
  return scopeTaskDto(detail, viewer);
}

async function loadLiveTask(id: string): Promise<TaskRow> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
    .limit(1);
  if (!row) throw new Error("TASK_NOT_FOUND");
  return row;
}

/**
 * A user task on a project, in a tramo (`workflowId` required: INVALID when
 * missing or not a live tramo), optionally in one of its fases
 * (PHASE_MISMATCH) and one of the project's espacios (SPACE_MISMATCH). Never
 * writes `project_stages`: only startTramo starts a tramo (BE §7.5).
 */
export async function createUserTask(input: UserTaskInput, actorId: string): Promise<TaskDetail> {
  if (!input.workflowId) throw flowError("INVALID", "workflowId");
  return insertUserTask(input, actorId, null);
}

/** Throws INVALID unless `workflowId` is a live (not deleted) tramo. */
async function assertLiveWorkflow(workflowId: string): Promise<void> {
  const [row] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), isNull(workflows.deletedAt)))
    .limit(1);
  if (!row) throw flowError("INVALID", "workflowId");
}

async function insertUserTask(
  input: UserTaskInput,
  actorId: string,
  parentTaskId: string | null
): Promise<TaskDetail> {
  if (!input.projectId) throw new Error("TASK_PROJECT_REQUIRED");
  const title = input.title.trim();
  if (!title) throw new Error("TASK_TITLE_REQUIRED");
  const workflowId = input.workflowId ?? null;
  const phaseId = input.phaseId ?? null;
  const spaceId = input.spaceId ?? null;
  // A subtask takes its parent's tramo and fase as they are (the FK already ties them).
  if (workflowId && !parentTaskId) await assertLiveWorkflow(workflowId);
  if (phaseId && !parentTaskId) {
    // A fase needs a tramo (tasks_phase_needs_workflow_check).
    if (!workflowId) throw flowError("PHASE_MISMATCH");
    await assertPhaseInWorkflow(db, phaseId, workflowId);
  }
  if (spaceId) await assertSpaceInProject(db, spaceId, input.projectId);

  const [row] = await db
    .insert(tasks)
    .values({
      projectId: input.projectId,
      parentTaskId,
      kind: "usuario",
      templateId: null,
      workflowId,
      phaseId,
      spaceId,
      title,
      notes: clean(input.notes),
      createdById: actorId,
      managerId: input.managerId ?? null,
      priority: input.priority ?? "media",
      commitmentDate: clean(input.commitmentDate),
      reviewDate: clean(input.reviewDate),
      deliveryDate: clean(input.deliveryDate),
    })
    .returning();

  if (input.supportIds && input.supportIds.length > 0) {
    await setTaskSupport(row.id, input.supportIds, actorId, { silent: true });
  }
  await recordChanges({
    entity: "task",
    entityId: row.id,
    actorId,
    before: { created: null },
    after: { created: title },
    fields: ["created"],
  });
  return (await getTask(row.id))!;
}

/**
 * The live parent a subtask would hang from, or an error: TASK_NOT_FOUND when
 * the parent (or its project) is missing or deleted, TASK_NESTED when the
 * parent is itself a subtask of a live task. A child whose parent was
 * soft-deleted behaves as top-level, so it can take subtasks.
 */
export async function loadSubtaskParent(parentId: string): Promise<TaskRow> {
  const [row] = await db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, parentId), isNull(tasks.deletedAt), isNull(projects.deletedAt)))
    .limit(1);
  if (!row) throw new Error("TASK_NOT_FOUND");
  const parent = row.task;
  if (parent.parentTaskId) {
    const [grandparent] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, parent.parentTaskId), isNull(tasks.deletedAt)))
      .limit(1);
    if (grandparent) throw new Error("TASK_NESTED");
  }
  return parent;
}

/**
 * A `usuario` child task with the parent's project, tramo and fase; `spaceId`
 * allowed (must be an espacio of the project). One level only.
 */
export async function createSubtask(parentId: string, input: SubtaskInput, actorId: string): Promise<TaskDetail> {
  const parent = await loadSubtaskParent(parentId);
  // An admin parent makes an admin child: no tramo, fase or espacio; administrator assignees only.
  if (parent.kind === "admin") {
    return insertAdminTask(
      {
        projectId: parent.projectId,
        title: input.title,
        notes: input.notes,
        managerId: input.managerId,
        supportIds: input.supportIds,
        priority: input.priority,
        commitmentDate: input.commitmentDate,
        reviewDate: input.reviewDate,
        deliveryDate: input.deliveryDate,
      },
      actorId,
      parent.id
    );
  }
  return insertUserTask(
    { ...input, projectId: parent.projectId, workflowId: parent.workflowId, phaseId: parent.phaseId },
    actorId,
    parent.id
  );
}

/** Live (not deleted, not archived) child tasks of `parentId`, in list order. */
export async function listSubtasks(parentId: string, viewer: ViewerScope): Promise<TaskRef[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      managerName: staff.name,
      commitmentDate: tasks.commitmentDate,
    })
    .from(tasks)
    .leftJoin(staff, eq(staff.id, tasks.managerId))
    .where(
      and(
        eq(tasks.parentTaskId, parentId),
        isNull(tasks.deletedAt),
        eq(tasks.archived, false),
        viewer.isAdmin ? undefined : ne(tasks.kind, "admin")
      )
    )
    .orderBy(sql`${tasks.sortOrder} is null`, asc(tasks.sortOrder), asc(tasks.commitmentDate), asc(tasks.title));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    managerName: r.managerName ?? null,
    commitmentDate: r.commitmentDate ?? null,
  }));
}

/**
 * Tramo, fase and espacio rules of updateTask (BE §7.5, #1022):
 * - `workflowId` on a usuario task: setting a tramo on a task without one is
 *   open to task writers; changing an existing tramo needs `canMoveTramo`
 *   (admins) → `FORBIDDEN: task tramo change`. Clearing it, an unknown or
 *   deleted tramo, or a workflow task (tied to its template's tramo) →
 *   INVALID. Sending the current tramo again is a no-op.
 * - A move clears `phaseId` unless the same patch sets a fase of the new
 *   tramo (a fase belongs to exactly one tramo, so the old one never fits).
 * - `phaseId` must be a fase of the task's tramo (the new one when set in the
 *   same patch) → PHASE_MISMATCH; null clears it.
 * - `spaceId` must be an espacio of the task's project → SPACE_MISMATCH.
 * - On an admin task, `phaseId` / `spaceId` / `workflowId` → ADMIN_TASK.
 *
 * Returns the tramo the task left when it moved, else null.
 */
async function applyFlowPatch(
  before: TaskRow,
  patch: TaskPatch,
  set: Partial<TaskRow>,
  canMoveTramo: boolean
): Promise<string | null> {
  const isAdmin = before.kind === "admin";
  if (isAdmin && (patch.phaseId || patch.spaceId || patch.workflowId)) throw flowError("ADMIN_TASK");

  let workflowId = before.workflowId;
  let movedFrom: string | null = null;
  if (patch.workflowId !== undefined && patch.workflowId !== before.workflowId) {
    if (isAdmin || before.kind !== "usuario" || !patch.workflowId) throw flowError("INVALID", "workflowId");
    if (before.workflowId && !canMoveTramo) throw new Error(TASK_TRAMO_CHANGE_FORBIDDEN);
    await assertLiveWorkflow(patch.workflowId);
    set.workflowId = patch.workflowId;
    workflowId = patch.workflowId;
    if (before.workflowId) {
      movedFrom = before.workflowId;
      if (patch.phaseId === undefined) set.phaseId = null;
    }
  }

  if (patch.phaseId !== undefined) {
    if (patch.phaseId) {
      if (!workflowId) throw flowError("PHASE_MISMATCH");
      await assertPhaseInWorkflow(db, patch.phaseId, workflowId);
    }
    set.phaseId = patch.phaseId || null;
  }

  if (patch.spaceId !== undefined) {
    if (patch.spaceId) await assertSpaceInProject(db, patch.spaceId, before.projectId);
    set.spaceId = patch.spaceId || null;
  }
  return movedFrom;
}

/**
 * Admin task rules on a patch (BE §7.5): no fase, espacio or tramo
 * (`ADMIN_TASK`) and an administrator manager (`ASSIGNEE_NOT_ADMIN`).
 * Clearing one of them (null) is a no-op.
 */
async function assertAdminTaskPatch(patch: TaskPatch): Promise<void> {
  if (patch.phaseId || patch.spaceId || patch.workflowId) throw flowError("ADMIN_TASK");
  if (patch.managerId) await requireAdminAssignees([patch.managerId]);
}

/** History field of a tramo move; before/after hold the tramo names ("Movió la tarea de Diseño a Construcción"). */
const TRAMO_MOVE_HISTORY_FIELD = "tramo";

const TASK_FIELDS_BUT_TRAMO = TASK_TRACKED_FIELDS.filter((f) => f !== "workflowId");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Name of each tramo id (deleted ones included: the history keeps the name it had). */
async function tramoNames(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  const rows = await tx
    .select({ id: workflows.id, name: workflows.name })
    .from(workflows)
    .where(inArray(workflows.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * A tramo move inside one transaction: the task row, its live usuario
 * subtasks (same tramo; a subtask on the parent's old fase follows the
 * parent's new fase, any other fase is cleared) and one history entry per
 * moved task with the tramo names instead of the raw `workflowId` change.
 */
async function moveTaskTramo(
  before: TaskRow,
  set: Partial<TaskRow>,
  movedFrom: string,
  actorId: string
): Promise<void> {
  const toWorkflowId = set.workflowId!;
  await db.transaction(async (tx) => {
    const [after] = await tx.update(tasks).set(set).where(eq(tasks.id, before.id)).returning();
    // Workflow children stay: their template ties them to their tramo (tasks_template_fk).
    const children = (
      await tx
        .select()
        .from(tasks)
        .where(and(eq(tasks.parentTaskId, before.id), eq(tasks.kind, "usuario"), isNull(tasks.deletedAt)))
    ).filter((child) => child.workflowId !== toWorkflowId);
    const fromIds = children.map((c) => c.workflowId).filter((w): w is string => w !== null);
    const names = await tramoNames(tx, [...new Set([movedFrom, toWorkflowId, ...fromIds])]);
    const moveEvent = (entityId: string, fromId: string | null) =>
      tx.insert(historyEvents).values({
        entity: "task",
        entityId,
        kind: "cambio",
        actorId,
        field: TRAMO_MOVE_HISTORY_FIELD,
        beforeValue: fromId ? (names.get(fromId) ?? null) : null,
        afterValue: names.get(toWorkflowId) ?? null,
      });
    await recordChanges(
      { entity: "task", entityId: before.id, actorId, before, after: after!, fields: TASK_FIELDS_BUT_TRAMO },
      tx
    );
    await moveEvent(before.id, movedFrom);

    for (const child of children) {
      const phaseId = child.phaseId === before.phaseId ? after!.phaseId : null;
      const [moved] = await tx
        .update(tasks)
        .set({ workflowId: toWorkflowId, phaseId })
        .where(eq(tasks.id, child.id))
        .returning();
      await recordChanges(
        { entity: "task", entityId: child.id, actorId, before: child, after: moved!, fields: TASK_FIELDS_BUT_TRAMO },
        tx
      );
      await moveEvent(child.id, child.workflowId);
    }
  });
}

/** The live task's tramo id (null without one); TASK_NOT_FOUND when gone. */
export async function taskWorkflowId(id: string): Promise<string | null> {
  return (await loadLiveTask(id)).workflowId;
}

/** What a bulk change (#1040) checks per task: its kind, whether it's a subtask and which date "Vence" writes. TASK_NOT_FOUND when gone. */
export async function taskBulkFields(
  id: string
): Promise<{ kind: TaskRow["kind"]; parentTaskId: string | null; commitmentDate: string | null }> {
  const row = await loadLiveTask(id);
  return { kind: row.kind, parentTaskId: row.parentTaskId, commitmentDate: row.commitmentDate };
}

/**
 * `opts.canMoveTramo`: the actor may change a task's existing tramo (admins,
 * #1022); without it such a patch is `FORBIDDEN: task tramo change`.
 */
export async function updateTask(
  id: string,
  patch: TaskPatch,
  actorId: string,
  opts: { canMoveTramo?: boolean } = {}
): Promise<TaskDetail> {
  const before = await loadLiveTask(id);
  if (before.kind === "admin") await assertAdminTaskPatch(patch);
  const set: Partial<TaskRow> = {};
  if (patch.title !== undefined) set.title = patch.title.trim() || before.title;
  if (patch.notes !== undefined) set.notes = clean(patch.notes);
  const movedFrom = await applyFlowPatch(before, patch, set, opts.canMoveTramo ?? false);
  if (patch.priority !== undefined) set.priority = patch.priority;
  // Picking a built-in status leaves any custom one.
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.customStatusId = null;
    Object.assign(set, closedAtPatch(before, patch.status));
  }
  if (patch.managerId !== undefined) set.managerId = patch.managerId;
  if (patch.commitmentDate !== undefined) set.commitmentDate = clean(patch.commitmentDate);
  if (patch.reviewDate !== undefined) set.reviewDate = clean(patch.reviewDate);
  if (patch.deliveryDate !== undefined) set.deliveryDate = clean(patch.deliveryDate);

  if (movedFrom) {
    await moveTaskTramo(before, set, movedFrom, actorId);
    return (await getTask(id))!;
  }

  // A patch that changes nothing (e.g. the current tramo sent again) writes nothing.
  const [after] =
    Object.keys(set).length > 0 ? await db.update(tasks).set(set).where(eq(tasks.id, id)).returning() : [before];
  await recordChanges({ entity: "task", entityId: id, actorId, before, after, fields: TASK_TRACKED_FIELDS });
  return (await getTask(id))!;
}

export async function setTaskStatus(id: string, status: TaskStatus, actorId: string): Promise<TaskDetail> {
  return updateTask(id, { status }, actorId);
}

/** Move a task into a custom status (see underlyingStatus for what `tasks.status` keeps). */
export async function setTaskCustomStatus(
  id: string,
  customStatusId: string,
  actorId: string
): Promise<TaskDetail> {
  const before = await loadLiveTask(id);
  const [cs] = await db
    .select()
    .from(taskStatuses)
    .where(and(eq(taskStatuses.id, customStatusId), isNull(taskStatuses.deletedAt)))
    .limit(1);
  if (!cs) throw new Error("TASK_STATUS_NOT_FOUND");
  const [after] = await db
    .update(tasks)
    .set({ status: underlyingStatus(cs), customStatusId: cs.id, ...closedAtPatch(before, underlyingStatus(cs)) })
    .where(eq(tasks.id, id))
    .returning();
  await recordChanges({ entity: "task", entityId: id, actorId, before, after, fields: TASK_TRACKED_FIELDS });
  return (await getTask(id))!;
}

export async function assignTask(id: string, managerId: string | null, actorId: string): Promise<TaskDetail> {
  return updateTask(id, { managerId }, actorId);
}

export async function setTaskArchived(id: string, archived: boolean, actorId: string): Promise<TaskDetail> {
  const before = await loadLiveTask(id);
  const [after] = await db.update(tasks).set({ archived }).where(eq(tasks.id, id)).returning();
  await recordChanges({ entity: "task", entityId: id, actorId, before, after, fields: ["archived"] });
  return (await getTask(id))!;
}

/** How long a deleted task can still be restored (#1041). */
export const TASK_RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Soft delete. The live subtasks go with it, stamped with the same
 * `deleted_at` so `restoreTask` brings back exactly those. History stays;
 * the (project, template) slot is freed.
 */
export async function softDeleteTask(id: string, actorId: string): Promise<void> {
  await loadLiveTask(id);
  const deletedAt = new Date();
  await db.transaction(async (tx) => {
    const children = await tx
      .update(tasks)
      .set({ deletedAt })
      .where(and(eq(tasks.parentTaskId, id), isNull(tasks.deletedAt)))
      .returning({ id: tasks.id });
    await tx.update(tasks).set({ deletedAt }).where(eq(tasks.id, id));
    for (const taskId of [id, ...children.map((c) => c.id)]) {
      await recordChanges(
        {
          entity: "task",
          entityId: taskId,
          actorId,
          before: { deleted: false },
          after: { deleted: true },
          fields: ["deleted"],
        },
        tx
      );
    }
  });
}

/**
 * Undo `softDeleteTask` (#1041): the task and the subtasks deleted with it
 * (same `deleted_at`) come back. Only within `TASK_RESTORE_WINDOW_MS`, and
 * only for an admin or the person who deleted it (FORBIDDEN otherwise).
 * NOT_FOUND when the task doesn't exist or isn't deleted; INVALID once the
 * window has passed.
 */
export async function restoreTask(
  id: string,
  actor: { staffId: string; isAdmin: boolean },
  now: Date = new Date()
): Promise<void> {
  const [row] = await db
    .select({ deletedAt: tasks.deletedAt })
    .from(tasks)
    .where(eq(tasks.id, id))
    .limit(1);
  const deletedAt = row?.deletedAt ?? null;
  if (!deletedAt) throw flowError("NOT_FOUND", "task");
  if (now.getTime() - deletedAt.getTime() > TASK_RESTORE_WINDOW_MS) throw flowError("INVALID", "restore window");
  if (!actor.isAdmin) {
    const [event] = await db
      .select({ actorId: historyEvents.actorId })
      .from(historyEvents)
      .where(
        and(
          eq(historyEvents.entity, "task"),
          eq(historyEvents.entityId, id),
          eq(historyEvents.field, "deleted"),
          eq(historyEvents.afterValue, "true")
        )
      )
      .orderBy(desc(historyEvents.eventAt), desc(historyEvents.createdAt))
      .limit(1);
    if (event?.actorId !== actor.staffId) throw flowError("FORBIDDEN", "task restore");
  }
  await db.transaction(async (tx) => {
    const children = await tx
      .update(tasks)
      .set({ deletedAt: null })
      .where(and(eq(tasks.parentTaskId, id), eq(tasks.deletedAt, deletedAt)))
      .returning({ id: tasks.id });
    await tx.update(tasks).set({ deletedAt: null }).where(eq(tasks.id, id));
    for (const taskId of [id, ...children.map((c) => c.id)]) {
      await recordChanges(
        {
          entity: "task",
          entityId: taskId,
          actorId: actor.staffId || null,
          before: { deleted: true },
          after: { deleted: false },
          fields: ["deleted"],
        },
        tx
      );
    }
  });
}

/**
 * Merge `duplicateIds` into `keepId`: move their checklist/support rows to
 * the survivor, then soft-delete the duplicates (same mechanism as
 * `softDeleteTask`, per duplicate).
 *
 * Conflict resolution:
 * - task_support (PK task_id+staff_id): a duplicate's support row is
 *   dropped when the keep task already has that staff member as support;
 *   moved otherwise.
 * - task_checklist_items: free-standing rows with their own id — all move,
 *   no dedupe needed.
 * - history_events: never deleted — entity_id is repointed at keepId so the
 *   bitácora is preserved in full on the surviving task.
 * - child tasks (parent_task_id): a duplicate's children move under keepId.
 *   If keepId is itself a subtask they become top-level (one level only);
 *   keepId itself never becomes its own child.
 * - task_dependencies: both sides are repointed at keepId. Pairs that would
 *   point keepId at itself, or repeat a pair keepId already has, are dropped.
 */
export async function mergeTasks(
  keepId: string,
  duplicateIds: string[],
  actorId: string
): Promise<TaskDetail> {
  const ids = [...new Set(duplicateIds)].filter((id) => id !== keepId);
  if (ids.length === 0) throw new Error("TASK_MERGE_NO_DUPLICATES");

  const keep = await loadLiveTask(keepId);
  const dupRows = await db
    .select()
    .from(tasks)
    .where(and(inArray(tasks.id, ids), isNull(tasks.deletedAt)));
  if (dupRows.length !== ids.length) throw new Error("TASK_NOT_FOUND");
  // An admin task only merges with admin tasks (BE §8.6): mixing would leak or strand it.
  const keepIsAdmin = keep.kind === "admin";
  if (dupRows.some((r) => (r.kind === "admin") !== keepIsAdmin)) throw flowError("INVALID", "kind");

  await db.transaction(async (tx) => {
    // task_support: drop collisions with support the keep task already has.
    const keepSupport = await tx
      .select({ staffId: taskSupport.staffId })
      .from(taskSupport)
      .where(eq(taskSupport.taskId, keepId));
    const keepStaffIds = new Set(keepSupport.map((r) => r.staffId));
    const dupSupport = await tx
      .select({ taskId: taskSupport.taskId, staffId: taskSupport.staffId })
      .from(taskSupport)
      .where(inArray(taskSupport.taskId, ids));
    for (const row of dupSupport) {
      if (keepStaffIds.has(row.staffId)) {
        await tx
          .delete(taskSupport)
          .where(and(eq(taskSupport.taskId, row.taskId), eq(taskSupport.staffId, row.staffId)));
      } else {
        await tx
          .update(taskSupport)
          .set({ taskId: keepId })
          .where(and(eq(taskSupport.taskId, row.taskId), eq(taskSupport.staffId, row.staffId)));
        keepStaffIds.add(row.staffId);
      }
    }

    // task_checklist_items: free-standing, move all, no dedupe.
    await tx
      .update(taskChecklistItems)
      .set({ taskId: keepId })
      .where(inArray(taskChecklistItems.taskId, ids));

    // history_events: never deleted, only repointed to the survivor.
    await tx
      .update(historyEvents)
      .set({ entityId: keepId })
      .where(and(eq(historyEvents.entity, "task"), inArray(historyEvents.entityId, ids)));

    // Child tasks: move under the survivor, or top-level if the survivor is a subtask.
    const keepIsSubtask =
      keep.parentTaskId !== null &&
      !ids.includes(keep.parentTaskId) &&
      (
        await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.id, keep.parentTaskId), isNull(tasks.deletedAt)))
          .limit(1)
      ).length > 0;
    await tx
      .update(tasks)
      .set({ parentTaskId: keepIsSubtask ? null : keepId })
      .where(and(inArray(tasks.parentTaskId, ids), sql`${tasks.id} <> ${keepId}`));
    // The survivor was a child of a merged duplicate: it's top-level now.
    if (keep.parentTaskId !== null && ids.includes(keep.parentTaskId)) {
      await tx.update(tasks).set({ parentTaskId: null }).where(eq(tasks.id, keepId));
    }

    // task_dependencies: repoint both sides, dropping self-pairs and repeats.
    const allIds = [keepId, ...ids];
    const deps = await tx
      .select({ id: taskDependencies.id, taskId: taskDependencies.taskId, dependsOnTaskId: taskDependencies.dependsOnTaskId })
      .from(taskDependencies)
      .where(or(inArray(taskDependencies.taskId, allIds), inArray(taskDependencies.dependsOnTaskId, allIds)));
    const remap = (id: string) => (ids.includes(id) ? keepId : id);
    const seen = new Set<string>();
    // Rows already on keepId claim their pair first so they're the ones kept.
    const ordered = [
      ...deps.filter((d) => !ids.includes(d.taskId) && !ids.includes(d.dependsOnTaskId)),
      ...deps.filter((d) => ids.includes(d.taskId) || ids.includes(d.dependsOnTaskId)),
    ];
    for (const d of ordered) {
      const taskId = remap(d.taskId);
      const dependsOnTaskId = remap(d.dependsOnTaskId);
      const key = `${taskId}:${dependsOnTaskId}`;
      if (taskId === dependsOnTaskId || seen.has(key)) {
        await tx.delete(taskDependencies).where(eq(taskDependencies.id, d.id));
        continue;
      }
      seen.add(key);
      if (taskId !== d.taskId || dependsOnTaskId !== d.dependsOnTaskId) {
        await tx.update(taskDependencies).set({ taskId, dependsOnTaskId }).where(eq(taskDependencies.id, d.id));
      }
    }

    // Soft-delete the duplicates, recording it like a normal delete.
    await tx.update(tasks).set({ deletedAt: new Date() }).where(inArray(tasks.id, ids));
    for (const dup of dupRows) {
      await recordChanges(
        {
          entity: "task",
          entityId: dup.id,
          actorId,
          before: { deleted: false },
          after: { deleted: true },
          fields: ["deleted"],
        },
        tx
      );
    }
    await recordComment(
      {
        entity: "task",
        entityId: keepId,
        actorId,
        comment: `Fusión: se combinaron ${dupRows.length} tarea(s) duplicada(s) (${dupRows
          .map((r) => r.title)
          .join(", ")}) en esta tarea.`,
      },
      tx
    );
  });

  return (await getTask(keepId))!;
}

export async function setTaskSupport(
  taskId: string,
  staffIds: string[],
  actorId: string,
  options: { silent?: boolean } = {}
): Promise<StaffRef[]> {
  const wanted = new Set(staffIds);
  const [task] = await db.select({ kind: tasks.kind }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (task?.kind === "admin") await requireAdminAssignees([...wanted]);
  const current = await db
    .select({ staffId: taskSupport.staffId })
    .from(taskSupport)
    .where(eq(taskSupport.taskId, taskId));
  const currentIds = new Set(current.map((c) => c.staffId));
  const toRemove = [...currentIds].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !currentIds.has(id));

  if (toRemove.length > 0) {
    await db.delete(taskSupport).where(and(eq(taskSupport.taskId, taskId), inArray(taskSupport.staffId, toRemove)));
  }
  if (toAdd.length > 0) {
    await db.insert(taskSupport).values(toAdd.map((staffId) => ({ taskId, staffId })));
  }
  if (!options.silent && (toAdd.length > 0 || toRemove.length > 0)) {
    // The bitácora reads names ("Ana López, Luis Pérez"), not ids (#1038).
    const ids = [...new Set([...currentIds, ...wanted])];
    const people = await db.select({ id: staff.id, name: staff.name }).from(staff).where(inArray(staff.id, ids));
    const nameOf = new Map(people.map((p) => [p.id, p.name]));
    const names = (set: Set<string>) =>
      [...set]
        .map((id) => nameOf.get(id) ?? id)
        .sort((x, y) => x.localeCompare(y, "es"))
        .join(", ");
    await recordChanges({
      entity: "task",
      entityId: taskId,
      actorId,
      before: { support: names(currentIds) },
      after: { support: names(wanted) },
      fields: ["support"],
    });
  }
  return (await loadSupport([taskId])).get(taskId) ?? [];
}

// ── Checklist ───────────────────────────────────────────────────────────────
export async function addChecklistItem(taskId: string, title: string): Promise<TaskChecklistItem> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(taskChecklistItems)
    .where(eq(taskChecklistItems.taskId, taskId));
  const [row] = await db
    .insert(taskChecklistItems)
    .values({ taskId, title: title.trim(), sortOrder: n })
    .returning();
  return toChecklistItem(row);
}

export async function updateChecklistItem(
  id: string,
  patch: { title?: string; completed?: boolean }
): Promise<TaskChecklistItem> {
  const set: Partial<typeof taskChecklistItems.$inferSelect> = {};
  if (patch.title !== undefined) set.title = patch.title.trim();
  if (patch.completed !== undefined) set.completed = patch.completed;
  const [row] = await db.update(taskChecklistItems).set(set).where(eq(taskChecklistItems.id, id)).returning();
  if (!row) throw new Error("CHECKLIST_ITEM_NOT_FOUND");
  return toChecklistItem(row);
}

export async function removeChecklistItem(id: string): Promise<void> {
  await db.delete(taskChecklistItems).where(eq(taskChecklistItems.id, id));
}

export async function reorderChecklist(taskId: string, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx
        .update(taskChecklistItems)
        .set({ sortOrder: i })
        .where(and(eq(taskChecklistItems.id, id), eq(taskChecklistItems.taskId, taskId)));
    }
  });
}

/**
 * Persists a manual drag-and-drop order for a project's tasks (Actividades).
 * Rewrites sortOrder for every id given, scoped to that project so a stray
 * id from another project can't be repositioned by mistake. Not a tracked
 * field — reordering doesn't change any task content, just display order.
 */
export async function reorderProjectTasks(projectId: string, orderedTaskIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedTaskIds.entries()) {
      await tx
        .update(tasks)
        .set({ sortOrder: i })
        .where(and(eq(tasks.id, id), eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
    }
  });
}

/**
 * Rewrites sortOrder for every id given, across projects — used by the
 * Actividades General view, where one área panel mixes several projects.
 * Relative order inside each project is preserved, so the per-department
 * project panels keep showing a consistent order too.
 */
export async function reorderTasks(orderedTaskIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedTaskIds.entries()) {
      await tx.update(tasks).set({ sortOrder: i }).where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
    }
  });
}

// ── Comments and history ────────────────────────────────────────────────────
export async function addTaskComment(taskId: string, comment: string, actorId: string): Promise<HistoryEvent> {
  const text = comment.trim();
  if (!text) throw new Error("COMMENT_REQUIRED");
  await loadLiveTask(taskId);
  return recordComment({ entity: "task", entityId: taskId, actorId, comment: text });
}

export async function listTaskHistory(taskId: string): Promise<HistoryEvent[]> {
  return listHistory("task", taskId);
}

/** Tasks with any date inside the range, for the calendar. */
export async function listCalendar(dateFrom: string, dateTo: string, filters: TaskFilters, viewer: ViewerScope) {
  return listTasks({ ...filters, dateFrom, dateTo }, viewer);
}

export const newestFirst = desc(tasks.createdAt);

export interface TaskTrendSourceTask {
  id: string;
  createdAt: Date;
  project: { id: string; name: string; managerId: string | null };
  manager: { id: string } | null;
  support: StaffRef[];
}

/**
 * Dashboard "Avance de tareas" source (#601): live tasks created in the window
 * or completed in it, plus those completion events. Only moves into a status
 * that counts as completed are completions (BE §8.8; Cancelado isn't).
 * Archived, deleted and admin tasks (and tasks of deleted projects) are left out.
 */
export async function listTaskTrendSource(
  from: Date,
  to: Date
): Promise<{ tasks: TaskTrendSourceTask[]; completions: Array<{ taskId: string; at: Date }> }> {
  const statusEvents = await db
    .select({
      taskId: historyEvents.entityId,
      at: historyEvents.eventAt,
      field: historyEvents.field,
      before: historyEvents.beforeValue,
      after: historyEvents.afterValue,
    })
    .from(historyEvents)
    .where(
      and(
        eq(historyEvents.entity, "task"),
        eq(historyEvents.kind, "cambio"),
        inArray(historyEvents.field, ["status", "customStatusId"]),
        gte(historyEvents.eventAt, from),
        lt(historyEvents.eventAt, to)
      )
    );
  const statusIds = [
    ...new Set(
      statusEvents
        .filter((e) => e.field === "customStatusId")
        .flatMap((e) => [e.before, e.after])
        .filter((id): id is string => id !== null)
    ),
  ];
  // Deleted statuses included: the event happened while they existed.
  const statusRows =
    statusIds.length > 0
      ? await db
          .select({ id: taskStatuses.id, closes: taskStatuses.closes, countsAsCompleted: taskStatuses.countsAsCompleted })
          .from(taskStatuses)
          .where(inArray(sql`${taskStatuses.id}::text`, statusIds))
      : [];
  const events = completionsFromStatusEvents(
    statusEvents.map((e) => ({
      taskId: e.taskId,
      at: e.at,
      field: e.field as "status" | "customStatusId",
      before: e.before,
      after: e.after,
    })),
    new Map(statusRows.map((r) => [r.id, { closes: r.closes, countsAsCompleted: r.countsAsCompleted }]))
  );

  const completedIds = [...new Set(events.map((e) => e.taskId))];
  const createdInWindow = and(gte(tasks.createdAt, from), lt(tasks.createdAt, to));
  const rows = await db
    .select({
      id: tasks.id,
      createdAt: tasks.createdAt,
      managerId: tasks.managerId,
      projectId: projects.id,
      projectName: projects.name,
      projectManagerId: projects.managerId,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        isNull(tasks.deletedAt),
        isNull(projects.deletedAt),
        eq(tasks.archived, false),
        // Admin tasks are left out of every dashboard widget (BE §8.8).
        ne(tasks.kind, "admin"),
        completedIds.length > 0 ? or(createdInWindow, inArray(tasks.id, completedIds)) : createdInWindow
      )
    );

  const support = await loadSupport(rows.map((r) => r.id));
  const liveIds = new Set(rows.map((r) => r.id));
  return {
    tasks: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      project: { id: r.projectId, name: r.projectName, managerId: r.projectManagerId },
      manager: r.managerId ? { id: r.managerId } : null,
      support: support.get(r.id) ?? [],
    })),
    completions: events.filter((e) => liveIds.has(e.taskId)),
  };
}

export type TaskDueDay = { date: string; due: number; tramoKey: string | null };

/**
 * Tareas Visual "Esta semana": the open tasks matching `filters` whose due
 * date (`coalesce(commitment_date, delivery_date)`) falls in `[from, to]`,
 * per day, with the tramo most of them are in (`mode()` over
 * `workflows.key`, null when none has a tramo). Open = not `completado` and
 * not in a live custom status that closes. Days with no task are left out.
 */
export async function taskDueByDay(
  filters: TaskFilters,
  viewer: ViewerScope,
  range: { from: string; to: string }
): Promise<TaskDueDay[]> {
  const due = sql`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})`;
  const rows = await db
    .select({
      date: sql<string>`(${due})::text`,
      due: sql<number>`count(*)::int`,
      tramoKey: sql<string | null>`mode() within group (order by ${workflows.key})`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(projectSpaces, eq(projectSpaces.id, tasks.spaceId))
    .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
    .where(
      and(
        whereFilters(filters, viewer),
        ne(tasks.status, "completado"),
        sql`coalesce(${taskStatuses.closes}, false) = false`,
        sql`${due} between ${range.from}::date and ${range.to}::date`
      )
    )
    .groupBy(due)
    .orderBy(due);
  return rows.map((r) => ({ date: r.date, due: Number(r.due), tramoKey: r.tramoKey ?? null }));
}

export type TaskProjectCounts = { projectId: string; projectName: string; open: number; overdue: number; completed: number };

/**
 * Tareas Esencial card counts (`qk.tareas.byProject`), one `GROUP BY
 * project` over the tasks matching `filters` without `mostrar`: the open
 * ones, the open ones due before `today` (`coalesce(commitment_date,
 * delivery_date)`, America/Mexico_City by default) and the closed ones.
 * Open = not `completado` and not in a live custom status that closes.
 * Projects with no matching task are left out.
 */
export async function taskProjectCounts(
  filters: TaskFilters,
  viewer: ViewerScope,
  today: string = todayInAppTimeZone()
): Promise<TaskProjectCounts[]> {
  const base: TaskFilters = { ...filters, mostrar: undefined };
  const open = openTaskSql();
  const rows = await db
    .select({
      projectId: tasks.projectId,
      projectName: projects.name,
      open: sql<number>`(count(*) filter (where ${open}))::int`,
      overdue: sql<number>`(count(*) filter (where ${overdueTaskSql(today)}))::int`,
      completed: sql<number>`(count(*) filter (where not ${open}))::int`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(projectSpaces, eq(projectSpaces.id, tasks.spaceId))
    .where(whereFilters(base, viewer))
    .groupBy(tasks.projectId, projects.name);
  return rows.map((r) => ({
    projectId: r.projectId,
    projectName: r.projectName,
    open: Number(r.open),
    overdue: Number(r.overdue),
    completed: Number(r.completed),
  }));
}

// ── Tareas Analítico summary (#988) ─────────────────────────────────────────

/** The five counts of a summary row (`TareasSummaryCounts`) over the rows of its group. */
function summaryCountColumns(today: string) {
  const overdue = overdueTaskSql(today);
  return {
    total: sql<number>`count(*)::int`,
    open: sql<number>`(count(*) filter (where ${openTaskSql()}))::int`,
    overdue: sql<number>`(count(*) filter (where ${overdue}))::int`,
    blocked: sql<number>`(count(*) filter (where ${tasks.status} = 'bloqueado'))::int`,
    daysLateSum: sql<number>`(coalesce(sum(${todaySql(today)} - ${taskDueSql()}) filter (where ${overdue}), 0))::int`,
  };
}

function summaryCounts(r: { total: number; open: number; overdue: number; blocked: number; daysLateSum: number }): TareasSummaryCounts {
  return {
    total: Number(r.total),
    open: Number(r.open),
    overdue: Number(r.overdue),
    blocked: Number(r.blocked),
    daysLateSum: Number(r.daysLateSum),
  };
}

/**
 * Tareas Analítico counts (`qk.tareas.summary(f)`) in one statement:
 * `GROUP BY GROUPING SETS ((project, tramo), (project), ())`, with
 * `grouping()` telling the levels apart. Open = not completado and no
 * closing custom status; overdue = open and `coalesce(commitment_date,
 * delivery_date) < today` (`today` in America/Mexico_City, `YYYY-MM-DD`);
 * `daysLateSum` adds `today - due` over the overdue tasks. Same viewer scope
 * as the rows (`whereFilters`: admin tasks only for administrators who ask).
 *
 * `unfiltered` is the same filters without `mostrar` (one more grouped read,
 * only when `mostrar` is set). Projects by overdue desc, then name; tramos by
 * sort order with "Sin tramo" last.
 */
export async function taskSummary(filters: TaskFilters, viewer: ViewerScope, today: string): Promise<TareasSummary> {
  const f: TaskFilters = { ...filters, today };
  const counts = summaryCountColumns(today);
  const grouped = db
    .select({
      projectId: tasks.projectId,
      projectName: projects.name,
      workflowId: tasks.workflowId,
      workflowKey: workflows.key,
      workflowName: workflows.name,
      workflowSortOrder: workflows.sortOrder,
      projectLevel: sql<number>`grouping(${tasks.projectId})::int`,
      tramoLevel: sql<number>`grouping(${tasks.workflowId})::int`,
      ...counts,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    // The search matches fase and espacio names too.
    .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
    .leftJoin(projectSpaces, eq(projectSpaces.id, tasks.spaceId))
    .where(whereFilters(f, viewer))
    .groupBy(
      sql`grouping sets ((${tasks.projectId}, ${projects.name}, ${tasks.workflowId}, ${workflows.key}, ${workflows.name}, ${workflows.sortOrder}), (${tasks.projectId}, ${projects.name}), ())`
    );
  const unfilteredQuery = f.mostrar
    ? db
        .select({
          id: tasks.projectId,
          name: projects.name,
          workflowId: tasks.workflowId,
          total: sql<number>`count(*)::int`,
        })
        .from(tasks)
        .innerJoin(projects, eq(projects.id, tasks.projectId))
        .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
        .leftJoin(workflowPhases, eq(workflowPhases.id, tasks.phaseId))
        .leftJoin(projectSpaces, eq(projectSpaces.id, tasks.spaceId))
        .where(whereFilters({ ...f, mostrar: undefined }, viewer))
        .groupBy(tasks.projectId, projects.name, tasks.workflowId)
    : Promise.resolve(null);
  const [rows, unfilteredRows] = await Promise.all([grouped, unfilteredQuery]);

  let totals: TareasSummary["totals"] = { ...EMPTY_SUMMARY_COUNTS, projects: 0 };
  const byProject = new Map<string, TareasSummaryProject>();
  const projectOf = (id: string, name: string): TareasSummaryProject => {
    let entry = byProject.get(id);
    if (!entry) {
      entry = { project: { id, name }, ...EMPTY_SUMMARY_COUNTS, tramos: [] };
      byProject.set(id, entry);
    }
    return entry;
  };
  for (const r of rows) {
    const c = summaryCounts(r);
    if (Number(r.projectLevel) === 1) {
      totals = { ...c, projects: 0 };
      continue;
    }
    const entry = projectOf(r.projectId, r.projectName);
    if (Number(r.tramoLevel) === 1) {
      Object.assign(entry, c);
      continue;
    }
    entry.tramos.push({
      tramo: r.workflowId
        ? { id: r.workflowId, key: r.workflowKey ?? null, name: r.workflowName ?? SIN_TRAMO_LABEL, sortOrder: r.workflowSortOrder ?? SIN_TRAMO_SORT }
        : { id: null, key: null, name: SIN_TRAMO_LABEL, sortOrder: SIN_TRAMO_SORT },
      ...c,
    });
  }
  const projectsOut = [...byProject.values()].filter((p) => p.total > 0);
  for (const p of projectsOut) p.tramos.sort(compareSummaryTramos);
  projectsOut.sort(compareSummaryProjects);
  totals.projects = projectsOut.length;

  // Without `mostrar` the filtered set is the unfiltered one.
  const sourceRows =
    unfilteredRows ??
    projectsOut.flatMap((p) =>
      p.tramos.map((t) => ({ id: p.project.id, name: p.project.name, workflowId: t.tramo.id, total: t.total }))
    );
  const unfilteredById = new Map<string, TareasSummaryUnfilteredProject>();
  for (const r of sourceRows) {
    const entry = unfilteredById.get(r.id) ?? { id: r.id, name: r.name, total: 0, byTramo: {} };
    const n = Number(r.total);
    entry.total += n;
    const key = summaryTramoKey(r.workflowId);
    entry.byTramo[key] = (entry.byTramo[key] ?? 0) + n;
    unfilteredById.set(r.id, entry);
  }
  const projectList = [...unfilteredById.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  return {
    projects: projectsOut,
    totals,
    unfiltered: {
      projects: projectList.length,
      total: projectList.reduce((sum, p) => sum + p.total, 0),
      projectList,
    },
  };
}
