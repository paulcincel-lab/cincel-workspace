import { and, asc, desc, eq, getTableColumns, gte, inArray, isNull, lt, lte, ne, or, sql, type SQLWrapper } from "drizzle-orm";
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
import { flowError } from "@/lib/project-flow/errors";
import { completionsFromStatusEvents } from "@/lib/dashboard/task-trend";
import { assertAdminAssignees } from "@/lib/project-flow/admin-tasks";
import type { AdminTaskFilters } from "@/lib/validation/project-flow";
import { listHistory, recordChanges, recordComment } from "@/lib/repositories/history-repository";
import { assertSpaceInProject } from "@/lib/repositories/project-spaces-repository";
import { assertPhaseInWorkflow } from "@/lib/repositories/workflow-phases-repository";
import { underlyingStatus } from "@/lib/repositories/task-statuses-repository";
import { UNSCOPED_VIEWER, scopeTaskDto } from "@/lib/auth/viewer-scope";
import { normalizeTaskLinkUrl } from "@/lib/tasks/task-links";
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

function whereFilters(f: TaskFilters, viewer: ViewerScope) {
  const statuses = f.status ? (Array.isArray(f.status) ? f.status : [f.status]) : undefined;
  return and(
    isNull(tasks.deletedAt),
    isNull(projects.deletedAt),
    f.archived === undefined ? eq(tasks.archived, false) : eq(tasks.archived, f.archived),
    f.projectId ? eq(tasks.projectId, f.projectId) : undefined,
    f.workflowId ? eq(tasks.workflowId, f.workflowId) : undefined,
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
    f.search ? searchMatch(f.search) : undefined
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
 * The task list statement shared by `listTasks` and `listTaskRows`. `slim`
 * leaves `notes` out and adds the comment and attachment counts.
 */
async function selectTaskList(filters: TaskFilters, viewer: ViewerScope, slim: boolean) {
  const agg = taskAggregates();
  const parent = alias(tasks, "parent_task");
  const taskColumns = withoutNotes(getTableColumns(tasks));
  const rows = await db
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
    .where(whereFilters(filters, viewer))
    // Tramo, then fase, then manual order (BE §8.6); tasks without one go last.
    .orderBy(
      sql`${workflows.sortOrder} asc nulls last`,
      sql`${workflowPhases.sortOrder} asc nulls last`,
      sql`${tasks.sortOrder} asc nulls last`,
      asc(tasks.commitmentDate),
      asc(tasks.title)
    );

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
    return { item, commentCount: r.commentCount, attachmentCount: r.attachmentCount };
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
  return (await selectTaskList(filters, viewer, true)).map(({ item, commentCount, attachmentCount }) => ({
    ...withoutNotes(item),
    subtaskDone: item.subtaskDoneCount,
    commentCount,
    attachmentCount,
    checklistTotal: item.checklist.total,
    checklistDone: item.checklist.completed,
  }));
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
 * Tramo, fase and espacio rules of updateTask (BE §7.5):
 * - `workflowId` only on a usuario task that has none (legacy tasks the
 *   backfill couldn't place); any other change → INVALID. Sending the
 *   current tramo again is a no-op.
 * - `phaseId` must be a fase of the task's tramo (the new one when set in the
 *   same patch) → PHASE_MISMATCH; null clears it.
 * - `spaceId` must be an espacio of the task's project → SPACE_MISMATCH.
 * - On an admin task, `phaseId` / `spaceId` → ADMIN_TASK.
 */
async function applyFlowPatch(before: TaskRow, patch: TaskPatch, set: Partial<TaskRow>): Promise<void> {
  const isAdmin = before.kind === "admin";
  if (isAdmin && (patch.phaseId || patch.spaceId)) throw flowError("ADMIN_TASK");

  let workflowId = before.workflowId;
  if (patch.workflowId !== undefined && patch.workflowId !== before.workflowId) {
    if (before.workflowId || isAdmin || before.kind !== "usuario" || !patch.workflowId) {
      throw flowError("INVALID", "workflowId");
    }
    await assertLiveWorkflow(patch.workflowId);
    set.workflowId = patch.workflowId;
    workflowId = patch.workflowId;
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
}

/**
 * Admin task rules on a patch (BE §7.5): no fase, espacio or tramo
 * (`ADMIN_TASK`, `INVALID` for a tramo) and an administrator manager
 * (`ASSIGNEE_NOT_ADMIN`). Clearing one of them (null) is a no-op.
 */
async function assertAdminTaskPatch(patch: TaskPatch): Promise<void> {
  if (patch.phaseId || patch.spaceId) throw flowError("ADMIN_TASK");
  if (patch.workflowId) throw flowError("INVALID", "workflowId");
  if (patch.managerId) await requireAdminAssignees([patch.managerId]);
}

export async function updateTask(id: string, patch: TaskPatch, actorId: string): Promise<TaskDetail> {
  const before = await loadLiveTask(id);
  if (before.kind === "admin") await assertAdminTaskPatch(patch);
  const set: Partial<TaskRow> = {};
  if (patch.title !== undefined) set.title = patch.title.trim() || before.title;
  if (patch.notes !== undefined) set.notes = clean(patch.notes);
  await applyFlowPatch(before, patch, set);
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

/** Soft delete. History stays; the (project, template) slot is freed. */
export async function softDeleteTask(id: string, actorId: string): Promise<void> {
  await loadLiveTask(id);
  await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, id));
  await recordChanges({
    entity: "task",
    entityId: id,
    actorId,
    before: { deleted: false },
    after: { deleted: true },
    fields: ["deleted"],
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
    await recordChanges({
      entity: "task",
      entityId: taskId,
      actorId,
      before: { support: [...currentIds].sort().join(",") },
      after: { support: [...wanted].sort().join(",") },
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

/** Open tasks grouped for the board: by status, ordered by commitment date. */
export async function listBoard(
  filters: TaskFilters,
  viewer: ViewerScope
): Promise<Record<TaskStatus, TaskListItem[]>> {
  const all = await listTasks({ ...filters, archived: false }, viewer);
  const board: Record<TaskStatus, TaskListItem[]> = {
    pendiente: [],
    en_proceso: [],
    completado: [],
    bloqueado: [],
  };
  for (const t of all) board[t.status].push(t);
  return board;
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
