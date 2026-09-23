import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  contacts,
  historyEvents,
  projects,
  staff,
  taskAttachments,
  taskChecklistItems,
  taskStatuses,
  taskSupport,
  tasks,
  workflows,
} from "@/lib/db/schema";
import { listHistory, recordChanges, recordComment } from "@/lib/repositories/history-repository";
import type {
  HistoryEvent,
  StaffRef,
  Task,
  TaskAttachment,
  TaskChecklistItem,
  TaskDetail,
  TaskFilters,
  TaskListItem,
  TaskPatch,
  TaskStatus,
  UserTaskInput,
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
    phase: row.phase,
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
}): TaskAttachment {
  return {
    id: row.id,
    taskId: row.taskId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedById ? { id: row.uploadedById, name: row.uploadedByName ?? "" } : null,
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
  actorId: string
): Promise<TaskAttachment> {
  if (!ALLOWED_ATTACHMENT_MIME.test(file.mimeType)) {
    throw new Error("TASK_ATTACHMENT_TYPE_NOT_ALLOWED");
  }
  if (file.data.byteLength === 0 || file.data.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("TASK_ATTACHMENT_TOO_LARGE");
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
    })
    .returning();

  await recordComment({ entity: "task", entityId: taskId, actorId, comment: `Adjuntó un archivo: ${row.fileName}` });

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

const TASK_TRACKED_FIELDS = [
  "title",
  "notes",
  "phase",
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

function whereFilters(f: TaskFilters) {
  const statuses = f.status ? (Array.isArray(f.status) ? f.status : [f.status]) : undefined;
  return and(
    isNull(tasks.deletedAt),
    isNull(projects.deletedAt),
    f.archived === undefined ? eq(tasks.archived, false) : eq(tasks.archived, f.archived),
    f.projectId ? eq(tasks.projectId, f.projectId) : undefined,
    f.workflowId ? eq(tasks.workflowId, f.workflowId) : undefined,
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
    f.search ? sql`${tasks.title} ilike ${"%" + f.search.trim() + "%"}` : undefined
  );
}

export async function listTasks(filters: TaskFilters = {}): Promise<TaskListItem[]> {
  const rows = await db
    .select({
      task: tasks,
      projectName: projects.name,
      clientName: contacts.name,
      workflowId: workflows.id,
      workflowKey: workflows.key,
      workflowName: workflows.name,
      managerName: staff.name,
      customStatusName: taskStatuses.name,
      checklistTotal: sql<number>`(select count(*) from core.task_checklist_items c where c.task_id = ${tasks.id})::int`,
      checklistDone: sql<number>`(select count(*) from core.task_checklist_items c where c.task_id = ${tasks.id} and c.completed)::int`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(contacts, eq(contacts.id, projects.clientId))
    .leftJoin(workflows, eq(workflows.id, tasks.workflowId))
    .leftJoin(staff, eq(staff.id, tasks.managerId))
    .leftJoin(taskStatuses, and(eq(taskStatuses.id, tasks.customStatusId), isNull(taskStatuses.deletedAt)))
    .where(whereFilters(filters))
    .orderBy(sql`${tasks.sortOrder} is null`, asc(tasks.sortOrder), asc(tasks.commitmentDate), asc(tasks.title));

  const support = await loadSupport(rows.map((r) => r.task.id));
  return rows.map((r) => ({
    ...toTask(r.task),
    customStatus: r.task.customStatusId && r.customStatusName ? { id: r.task.customStatusId, name: r.customStatusName } : null,
    project: { id: r.task.projectId, name: r.projectName, clientName: r.clientName },
    workflow: r.workflowId ? { id: r.workflowId, key: r.workflowKey!, name: r.workflowName! } : null,
    manager: r.task.managerId ? { id: r.task.managerId, name: r.managerName! } : null,
    support: support.get(r.task.id) ?? [],
    checklist: { total: r.checklistTotal, completed: r.checklistDone },
  }));
}

/** Tasks where the staff member is manager or support. */
export async function listMyTasks(staffId: string, filters: TaskFilters = {}): Promise<TaskListItem[]> {
  return listTasks({ ...filters, involvesStaffId: staffId });
}

export async function getTask(id: string): Promise<TaskDetail | null> {
  const [item] = await listTasks({ archived: undefined, search: undefined }).then((all) =>
    all.filter((t) => t.id === id)
  );
  const base =
    item ??
    (await listTasks({ archived: true }).then((all) => all.find((t) => t.id === id)));
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

  return {
    ...base,
    createdBy: creator ?? { id: base.createdById, name: "" },
    checklistItems: checklist.map(toChecklistItem),
    attachments,
    history,
  };
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

/** A user task: free-form, on a project, optionally placed in a stage. */
export async function createUserTask(input: UserTaskInput, actorId: string): Promise<TaskDetail> {
  if (!input.projectId) throw new Error("TASK_PROJECT_REQUIRED");
  const title = input.title.trim();
  if (!title) throw new Error("TASK_TITLE_REQUIRED");

  const [row] = await db
    .insert(tasks)
    .values({
      projectId: input.projectId,
      kind: "usuario",
      templateId: null,
      workflowId: input.workflowId ?? null,
      phase: clean(input.phase),
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

export async function updateTask(id: string, patch: TaskPatch, actorId: string): Promise<TaskDetail> {
  const before = await loadLiveTask(id);
  const set: Partial<TaskRow> = {};
  if (patch.title !== undefined) set.title = patch.title.trim() || before.title;
  if (patch.notes !== undefined) set.notes = clean(patch.notes);
  if (patch.phase !== undefined) set.phase = clean(patch.phase);
  if (patch.priority !== undefined) set.priority = patch.priority;
  // Picking a base status always clears the display-only custom one.
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.customStatusId = null;
  }
  if (patch.managerId !== undefined) set.managerId = patch.managerId;
  if (patch.commitmentDate !== undefined) set.commitmentDate = clean(patch.commitmentDate);
  if (patch.reviewDate !== undefined) set.reviewDate = clean(patch.reviewDate);
  if (patch.deliveryDate !== undefined) set.deliveryDate = clean(patch.deliveryDate);
  // Workflow tasks keep the workflow of their template (rule 2); only user tasks move.
  if (patch.workflowId !== undefined && before.kind === "usuario") set.workflowId = patch.workflowId;

  const [after] = await db.update(tasks).set(set).where(eq(tasks.id, id)).returning();
  await recordChanges({ entity: "task", entityId: id, actorId, before, after, fields: TASK_TRACKED_FIELDS });
  return (await getTask(id))!;
}

export async function setTaskStatus(id: string, status: TaskStatus, actorId: string): Promise<TaskDetail> {
  return updateTask(id, { status }, actorId);
}

/** Select a custom status (sets base status too) or, with null, leave as-is. */
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
    .set({ status: cs.baseStatus, customStatusId: cs.id })
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
 */
export async function mergeTasks(
  keepId: string,
  duplicateIds: string[],
  actorId: string
): Promise<TaskDetail> {
  const ids = [...new Set(duplicateIds)].filter((id) => id !== keepId);
  if (ids.length === 0) throw new Error("TASK_MERGE_NO_DUPLICATES");

  await loadLiveTask(keepId);
  const dupRows = await db
    .select()
    .from(tasks)
    .where(and(inArray(tasks.id, ids), isNull(tasks.deletedAt)));
  if (dupRows.length !== ids.length) throw new Error("TASK_NOT_FOUND");

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
export async function listBoard(filters: TaskFilters = {}): Promise<Record<TaskStatus, TaskListItem[]>> {
  const all = await listTasks({ ...filters, archived: false });
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
export async function listCalendar(dateFrom: string, dateTo: string, filters: TaskFilters = {}) {
  return listTasks({ ...filters, dateFrom, dateTo });
}

export const newestFirst = desc(tasks.createdAt);
