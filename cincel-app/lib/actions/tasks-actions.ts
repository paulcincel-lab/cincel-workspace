"use server";

import { toActionResult } from "@/lib/actions/action-result";
import type { ActionResult } from "@/lib/types/schedule";
import { revalidateInicioScreen } from "@/lib/cache/screens/inicio";
import { after } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { canSeeAdminData, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { flowError } from "@/lib/project-flow/errors";
import { openTasksInOrder } from "@/lib/my-space/my-tasks";
import { scopeTaskDto, viewerScopeOf } from "@/lib/auth/viewer-scope";
import * as taskDependenciesRepository from "@/lib/repositories/task-dependencies-repository";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import { scheduleTaskClosingHook } from "@/lib/tasks/closing-hook";
import { notifyTaskAssigned, notifyTaskCommented, notifyTraceId } from "@/lib/tasks/task-notifications";
import { AdminTaskFiltersSchema, AdminTaskInputSchema, parseInput } from "@/lib/validation/project-flow";
import type {
  AdminTaskInput,
  HistoryEvent,
  TaskAttachment,
  TaskBulkPatch,
  TaskBulkResult,
  TaskChecklistItem,
  TaskDetail,
  TaskFilters,
  TaskLink,
  TaskLinkInput,
  TaskListItem,
  SubtaskInput,
  TaskPatch,
  TaskRef,
  TaskStatus,
  UserTaskInput,
} from "@/lib/types/core";

async function requireTasksCapabilities() {
  const user = await requireCapabilityUser();
  return { ...resolveActivitiesCapabilities(user), viewer: viewerScopeOf(user) };
}

/**
 * Session user, its viewer scope, and the visibility guard on the given task
 * ids (BE §12): an admin task is FORBIDDEN for non-admins.
 */
async function requireTaskWriter(...taskIds: string[]) {
  const user = await requireCapabilityUser();
  const viewer = viewerScopeOf(user);
  await Promise.all([...new Set(taskIds)].map((id) => tasksRepository.assertTaskVisible(id, viewer)));
  return { user, viewer };
}

/** The checklist item's task id as a one-item list (empty when the item is gone). */
async function checklistItemTask(itemId: string): Promise<string[]> {
  const taskId = await tasksRepository.checklistItemTaskId(itemId);
  return taskId ? [taskId] : [];
}

export async function fetchTasksAction(filters: TaskFilters = {}): Promise<TaskListItem[]> {
  const caps = await requireTasksCapabilities();
  if (!caps.canViewActivities) return [];
  return tasksRepository.listTasks(filters, caps.viewer);
}

/** Own tasks; an administrator also gets their own admin tasks (BE §7.5). */
export async function fetchMyTasksAction(filters: TaskFilters = {}): Promise<TaskListItem[]> {
  const user = await requireCapabilityUser();
  return tasksRepository.listMyTasks(user.member.id, filters, viewerScopeOf(user));
}

/**
 * My open tasks (Mi espacio): the `fetchMyTasksAction` rows without
 * `completado` and without a custom status that closes the task, by
 * commitment date (undated last), then title. Staff id from the session.
 */
export async function fetchMyOpenTasksAction(): Promise<TaskListItem[]> {
  const user = await requireCapabilityUser();
  const rows = await tasksRepository.listMyTasks(user.member.id, {}, viewerScopeOf(user));
  return openTasksInOrder(rows);
}

export async function fetchCalendarAction(
  dateFrom: string,
  dateTo: string,
  filters: TaskFilters = {}
): Promise<TaskListItem[]> {
  const caps = await requireTasksCapabilities();
  if (!caps.canViewActivities) return [];
  return tasksRepository.listCalendar(dateFrom, dateTo, filters, caps.viewer);
}

export async function fetchTaskAction(id: string): Promise<TaskDetail | null> {
  const caps = await requireTasksCapabilities();
  if (!caps.canViewActivities) return null;
  // An admin task is null for non-admins (BE §7.5).
  return tasksRepository.getTaskForViewer(id, caps.viewer);
}

/**
 * A user task in a tramo. Errors: INVALID (no `workflowId` or not a live
 * tramo), PHASE_MISMATCH (fase not of that tramo), SPACE_MISMATCH (espacio not
 * of the project). Never starts the tramo: no `project_stages` row is written.
 */
export async function createUserTaskAction(
  ...args: Parameters<typeof createUserTaskActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createUserTaskActionImpl>>>> {
  return toActionResult(() => createUserTaskActionImpl(...args));
}

async function createUserTaskActionImpl(input: UserTaskInput): Promise<TaskDetail> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: task create");
  }
  const row = await tasksRepository.createUserTask(input, user.member.id);
  // No revalidation: the new-task dialog invalidates the Tareas, project, Inicio and badge keys.
  // Request-scoped values (actor, trace id) are read here; `after()` gets plain values only (#932).
  const assigned = { task: row, managerId: row.managerId, actorId: user.member.id, traceId: await notifyTraceId() };
  after(() => notifyTaskAssigned(assigned));
  return scopeTaskDto(row, viewerScopeOf(user));
}

const SUBTASK_ERRORS: Record<string, string> = {
  TASK_NOT_FOUND: "NOT_FOUND",
  TASK_NESTED: "NESTED",
};

/**
 * Creates a `usuario` child task with the parent's project, tramo and fase.
 * Same permission as creating a task. Throws FORBIDDEN, NOT_FOUND, NESTED
 * (the parent is already a subtask) or SPACE_MISMATCH.
 */
export async function createSubtaskAction(
  ...args: Parameters<typeof createSubtaskActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createSubtaskActionImpl>>>> {
  return toActionResult(() => createSubtaskActionImpl(...args));
}

async function createSubtaskActionImpl(parentId: string, input: SubtaskInput): Promise<TaskDetail> {
  const { user, viewer } = await requireTaskWriter(parentId);
  if (!resolveActivitiesCapabilities(user).canCreateActivity) throw new Error("FORBIDDEN");
  try {
    const row = await tasksRepository.createSubtask(parentId, input, user.member.id);
    return scopeTaskDto(row, viewer);
  } catch (err) {
    const code = err instanceof Error ? SUBTASK_ERRORS[err.message] : undefined;
    if (code) throw new Error(code);
    throw err;
  }
}

/** Live child tasks of a task, for the drawer's Subtareas section. */
export async function listSubtasksAction(parentId: string): Promise<TaskRef[]> {
  const caps = await requireTasksCapabilities();
  if (!caps.canViewActivities) return [];
  if (!(await tasksRepository.isTaskVisible(parentId, caps.viewer))) return [];
  return tasksRepository.listSubtasks(parentId, caps.viewer);
}

/**
 * `phaseId` within the task's tramo (PHASE_MISMATCH), `spaceId` of its project
 * (SPACE_MISMATCH), neither on an admin task (ADMIN_TASK). `workflowId` sets a
 * tramo on a task without one; changing an existing tramo is admins only
 * (`FORBIDDEN: task tramo change`), clears a fase that isn't in the new tramo
 * and moves the subtasks along (#1022). Admin tasks reject it (ADMIN_TASK);
 * an unknown tramo is INVALID.
 */
export async function updateTaskAction(
  ...args: Parameters<typeof updateTaskActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateTaskActionImpl>>>> {
  return toActionResult(() => updateTaskActionImpl(...args));
}

async function updateTaskActionImpl(id: string, patch: TaskPatch): Promise<TaskDetail> {
  const { user, viewer } = await requireTaskWriter(id);
  const caps = resolveActivitiesCapabilities(user);
  if (patch.status !== undefined && caps.statusScope === "none") {
    throw new Error("FORBIDDEN: task status change");
  }
  if (patch.managerId !== undefined && !caps.canChangeResponsible) {
    throw new Error("FORBIDDEN: task reassign");
  }
  if (!caps.canCreateActivity) {
    throw new Error("FORBIDDEN: task edit");
  }
  const fromTramo = patch.workflowId !== undefined ? await tasksRepository.taskWorkflowId(id) : null;
  const row = await tasksRepository.updateTask(id, patch, user.member.id, { canMoveTramo: viewer.isAdmin });
  // A move changes whether both tramos' stages are closed on the project.
  const moved = fromTramo !== null && fromTramo !== row.workflowId;
  if (patch.status !== undefined || moved) {
    await scheduleTaskClosingHook(
      moved ? [row, { projectId: row.projectId, workflowId: fromTramo }] : row,
      user.member.id
    );
  }
  return scopeTaskDto(row, viewer);
}

export async function setTaskStatusAction(
  ...args: Parameters<typeof setTaskStatusActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setTaskStatusActionImpl>>>> {
  return toActionResult(() => setTaskStatusActionImpl(...args));
}

async function setTaskStatusActionImpl(id: string, status: TaskStatus): Promise<TaskDetail> {
  const { user, viewer } = await requireTaskWriter(id);
  if (resolveActivitiesCapabilities(user).statusScope === "none") {
    throw new Error("FORBIDDEN: task status change");
  }
  const row = await tasksRepository.setTaskStatus(id, status, user.member.id);
  await scheduleTaskClosingHook(row, user.member.id);
  return scopeTaskDto(row, viewer);
}

export async function assignTaskAction(
  ...args: Parameters<typeof assignTaskActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof assignTaskActionImpl>>>> {
  return toActionResult(() => assignTaskActionImpl(...args));
}

async function assignTaskActionImpl(id: string, managerId: string | null): Promise<TaskDetail> {
  const { user, viewer } = await requireTaskWriter(id);
  if (!resolveActivitiesCapabilities(user).canChangeResponsible) {
    throw new Error("FORBIDDEN: task reassign");
  }
  const row = await tasksRepository.assignTask(id, managerId, user.member.id);
  // Request-scoped values (actor, trace id) are read here; `after()` gets plain values only (#932).
  const assigned = { task: row, managerId: row.managerId, actorId: user.member.id, traceId: await notifyTraceId() };
  after(() => notifyTaskAssigned(assigned));
  return scopeTaskDto(row, viewer);
}

export async function archiveTaskAction(id: string, archived: boolean): Promise<TaskDetail> {
  const { user, viewer } = await requireTaskWriter(id);
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: task archive");
  }
  const row = await tasksRepository.setTaskArchived(id, archived, user.member.id);
  return scopeTaskDto(row, viewer);
}

export async function deleteTaskAction(
  ...args: Parameters<typeof deleteTaskActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteTaskActionImpl>>>> {
  return toActionResult(() => deleteTaskActionImpl(...args));
}

async function deleteTaskActionImpl(id: string): Promise<void> {
  const { user } = await requireTaskWriter(id);
  if (!resolveActivitiesCapabilities(user).canDeleteActivity) {
    throw new Error("FORBIDDEN: task delete");
  }
  // No revalidation: the caller invalidates the Tareas, project and Inicio keys (`taskDeleteInvalidations`).
  await tasksRepository.softDeleteTask(id, user.member.id);
}

/**
 * Merge duplicate tasks into `keepId`: checklist/support/history, child
 * tasks and dependencies move to the survivor, then the duplicates are soft-deleted. Same capability as a
 * plain task delete — merging is destructive to the losing records.
 */
export async function mergeTasksAction(keepId: string, duplicateIds: string[]): Promise<TaskDetail> {
  const { user, viewer } = await requireTaskWriter(keepId, ...duplicateIds);
  if (!resolveActivitiesCapabilities(user).canDeleteActivity) {
    throw new Error("FORBIDDEN: task merge");
  }
  const row = await tasksRepository.mergeTasks(keepId, duplicateIds, user.member.id);
  return scopeTaskDto(row, viewer);
}

export async function restoreTaskAction(
  ...args: Parameters<typeof restoreTaskActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof restoreTaskActionImpl>>>> {
  return toActionResult(() => restoreTaskActionImpl(...args));
}

/**
 * Undoes `deleteTaskAction` (#1041): the task and the subtasks deleted with it
 * come back. Admins or the person who deleted it, within 30 days.
 */
async function restoreTaskActionImpl(id: string): Promise<void> {
  void id;
  throw new Error("not implemented: restoreTaskAction");
}

export async function bulkUpdateTasksAction(
  ...args: Parameters<typeof bulkUpdateTasksActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof bulkUpdateTasksActionImpl>>>> {
  return toActionResult(() => bulkUpdateTasksActionImpl(...args));
}

/**
 * One field on many tasks (#1040). Each task keeps its own permission (the
 * same checks as the single-task action for that field): tasks the viewer
 * can't change are skipped with the error code, the rest are updated.
 */
async function bulkUpdateTasksActionImpl(ids: string[], patch: TaskBulkPatch): Promise<TaskBulkResult> {
  void ids;
  void patch;
  throw new Error("not implemented: bulkUpdateTasksAction");
}

export async function setTaskSupportAction(
  ...args: Parameters<typeof setTaskSupportActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setTaskSupportActionImpl>>>> {
  return toActionResult(() => setTaskSupportActionImpl(...args));
}

async function setTaskSupportActionImpl(taskId: string, staffIds: string[]) {
  const { user } = await requireTaskWriter(taskId);
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: task support edit");
  }
  const support = await tasksRepository.setTaskSupport(taskId, staffIds, user.member.id);
  return support;
}

export async function addChecklistItemAction(
  ...args: Parameters<typeof addChecklistItemActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addChecklistItemActionImpl>>>> {
  return toActionResult(() => addChecklistItemActionImpl(...args));
}

async function addChecklistItemActionImpl(taskId: string, title: string): Promise<TaskChecklistItem> {
  const { user } = await requireTaskWriter(taskId);
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: checklist edit");
  }
  const row = await tasksRepository.addChecklistItem(taskId, title);
  return row;
}

export async function updateChecklistItemAction(
  ...args: Parameters<typeof updateChecklistItemActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateChecklistItemActionImpl>>>> {
  return toActionResult(() => updateChecklistItemActionImpl(...args));
}

async function updateChecklistItemActionImpl(
  id: string,
  patch: { title?: string; completed?: boolean }
): Promise<TaskChecklistItem> {
  await requireTaskWriter(...(await checklistItemTask(id)));
  const row = await tasksRepository.updateChecklistItem(id, patch);
  return row;
}

export async function removeChecklistItemAction(
  ...args: Parameters<typeof removeChecklistItemActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof removeChecklistItemActionImpl>>>> {
  return toActionResult(() => removeChecklistItemActionImpl(...args));
}

async function removeChecklistItemActionImpl(id: string): Promise<void> {
  const { user } = await requireTaskWriter(...(await checklistItemTask(id)));
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: checklist edit");
  }
  await tasksRepository.removeChecklistItem(id);
}

export async function reorderChecklistAction(
  ...args: Parameters<typeof reorderChecklistActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof reorderChecklistActionImpl>>>> {
  return toActionResult(() => reorderChecklistActionImpl(...args));
}

async function reorderChecklistActionImpl(taskId: string, orderedIds: string[]): Promise<void> {
  await requireTaskWriter(taskId);
  await tasksRepository.reorderChecklist(taskId, orderedIds);
}

export async function reorderProjectTasksAction(projectId: string, orderedTaskIds: string[]): Promise<void> {
  const { user } = await requireTaskWriter(...orderedTaskIds);
  if (!resolveActivitiesCapabilities(user).canReorderPhases) {
    throw new Error("FORBIDDEN: tasks reorder");
  }
  await tasksRepository.reorderProjectTasks(projectId, orderedTaskIds);
}

export async function reorderTasksAction(orderedTaskIds: string[]): Promise<void> {
  const { user } = await requireTaskWriter(...orderedTaskIds);
  if (!resolveActivitiesCapabilities(user).canReorderPhases) {
    throw new Error("FORBIDDEN: tasks reorder");
  }
  await tasksRepository.reorderTasks(orderedTaskIds);
}

export async function addTaskCommentAction(
  ...args: Parameters<typeof addTaskCommentActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addTaskCommentActionImpl>>>> {
  return toActionResult(() => addTaskCommentActionImpl(...args));
}

async function addTaskCommentActionImpl(taskId: string, comment: string): Promise<HistoryEvent> {
  const { user } = await requireTaskWriter(taskId);
  const row = await tasksRepository.addTaskComment(taskId, comment, user.member.id);
  // Request-scoped values (actor, trace id) are read here; `after()` gets plain values only (#932).
  const commented = {
    taskId,
    eventId: row.id,
    comment: row.comment ?? comment,
    actorId: user.member.id,
    traceId: await notifyTraceId(),
  };
  after(() => notifyTaskCommented(commented));
  return row;
}

export async function fetchTaskHistoryAction(taskId: string): Promise<HistoryEvent[]> {
  const user = await requireCapabilityUser();
  if (!(await tasksRepository.isTaskVisible(taskId, viewerScopeOf(user)))) return [];
  return tasksRepository.listTaskHistory(taskId);
}

const ATTACHMENT_ERROR_MESSAGES: Record<string, string> = {
  TASK_ATTACHMENT_TYPE_NOT_ALLOWED: "Solo se permiten imágenes o archivos .txt.",
  TASK_ATTACHMENT_TOO_LARGE: "El archivo supera el límite de 10MB.",
  CHECKLIST_ITEM_NOT_FOUND: "Ese punto del checklist ya no existe.",
};

/** Attaches a file to a task as a comment (#425). Images and .txt only, up to 10MB. */
export async function addTaskAttachmentAction(
  ...args: Parameters<typeof addTaskAttachmentActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addTaskAttachmentActionImpl>>>> {
  return toActionResult(() => addTaskAttachmentActionImpl(...args));
}

async function addTaskAttachmentActionImpl(taskId: string, formData: FormData): Promise<TaskAttachment> {
  const { user } = await requireTaskWriter(taskId);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("No se recibió ningún archivo.");
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const checklistItemId = formData.get("checklistItemId");
    const row = await tasksRepository.addTaskAttachment(
      taskId,
      { name: file.name, mimeType: file.type || "application/octet-stream", data: buffer },
      user.member.id,
      typeof checklistItemId === "string" && checklistItemId ? checklistItemId : null
    );
    return row;
  } catch (err) {
    const message = err instanceof Error ? ATTACHMENT_ERROR_MESSAGES[err.message] : undefined;
    throw new Error(message ?? "No se pudo adjuntar el archivo.");
  }
}

export async function setTaskCustomStatusAction(
  ...args: Parameters<typeof setTaskCustomStatusActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setTaskCustomStatusActionImpl>>>> {
  return toActionResult(() => setTaskCustomStatusActionImpl(...args));
}

async function setTaskCustomStatusActionImpl(id: string, customStatusId: string): Promise<TaskDetail> {
  const { user, viewer } = await requireTaskWriter(id);
  if (resolveActivitiesCapabilities(user).statusScope === "none") {
    throw new Error("FORBIDDEN: task status change");
  }
  const row = await tasksRepository.setTaskCustomStatus(id, customStatusId, user.member.id);
  await scheduleTaskClosingHook(row, user.member.id);
  return scopeTaskDto(row, viewer);
}

const LINK_ERROR_MESSAGES: Record<string, string> = {
  TASK_LINK_TITLE_REQUIRED: "Escribe un nombre para el enlace.",
  TASK_LINK_URL_INVALID: "El enlace debe ser una URL válida que empiece con http:// o https://.",
  TASK_LINK_KIND_INVALID: "Elige si el enlace es interno o del cliente.",
};

/** Adds an internal or client Drive/web link to a task (#436). */
export async function addTaskLinkAction(taskId: string, input: TaskLinkInput): Promise<TaskLink> {
  const { user } = await requireTaskWriter(taskId);
  try {
    const row = await tasksRepository.addTaskLink(taskId, input, user.member.id);
      return row;
  } catch (err) {
    const message = err instanceof Error ? LINK_ERROR_MESSAGES[err.message] : undefined;
    throw new Error(message ?? "No se pudo agregar el enlace.");
  }
}

export async function removeTaskLinkAction(id: string): Promise<void> {
  const linkTaskId = await tasksRepository.taskLinkTaskId(id);
  const { user } = await requireTaskWriter(...(linkTaskId ? [linkTaskId] : []));
  await tasksRepository.removeTaskLink(id, user.member.id);
}

/**
 * `taskId` waits on `dependsOnTaskId` ("Depende de"). Same project, no self,
 * no duplicate, no cycle. Whoever can edit the task can edit its dependencies.
 * Throws `FORBIDDEN`, `NOT_FOUND`, `OTHER_PROJECT`, `SELF`, `DUPLICATE`, `CYCLE`.
 */
export async function addTaskDependencyAction(
  ...args: Parameters<typeof addTaskDependencyActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addTaskDependencyActionImpl>>>> {
  return toActionResult(() => addTaskDependencyActionImpl(...args));
}

async function addTaskDependencyActionImpl(taskId: string, dependsOnTaskId: string): Promise<void> {
  const { user } = await requireTaskWriter(taskId, dependsOnTaskId);
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: task dependency edit");
  }
  await taskDependenciesRepository.addTaskDependency(taskId, dependsOnTaskId);
}

/** Removes a dependency. Throws `FORBIDDEN`, `NOT_FOUND`. */
export async function removeTaskDependencyAction(
  ...args: Parameters<typeof removeTaskDependencyActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof removeTaskDependencyActionImpl>>>> {
  return toActionResult(() => removeTaskDependencyActionImpl(...args));
}

async function removeTaskDependencyActionImpl(taskId: string, dependsOnTaskId: string): Promise<void> {
  const { user } = await requireTaskWriter(taskId, dependsOnTaskId);
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: task dependency edit");
  }
  await taskDependenciesRepository.removeTaskDependency(taskId, dependsOnTaskId);
}

/** Tasks this one waits on (`dependsOn`) and tasks that wait on it (`blocks`). */
export async function listTaskDependenciesAction(
  taskId: string
): Promise<{ dependsOn: TaskRef[]; blocks: TaskRef[] }> {
  const caps = await requireTasksCapabilities();
  if (!caps.canViewActivities) return { dependsOn: [], blocks: [] };
  if (!(await tasksRepository.isTaskVisible(taskId, caps.viewer))) return { dependsOn: [], blocks: [] };
  return taskDependenciesRepository.listTaskDependencies(taskId, caps.viewer);
}

// ── Admin tasks (project flow BE §7.5) ──────────────────────────────────────

/**
 * Open admin tasks (all with `includeClosed`), by commitment date then
 * project name. Administrators only: FORBIDDEN otherwise.
 */
export async function fetchAdminTasksAction(
  filters: { projectId?: string; includeClosed?: boolean } = {}
): Promise<TaskListItem[]> {
  const user = await requireCapabilityUser();
  if (!canSeeAdminData(user)) throw flowError("FORBIDDEN");
  return tasksRepository.listAdminTasks(parseInput(AdminTaskFiltersSchema, filters));
}

/** `kind = 'admin'`. Errors: FORBIDDEN (non-admin), NOT_FOUND, ASSIGNEE_NOT_ADMIN. */
export async function createAdminTaskAction(input: AdminTaskInput): Promise<TaskDetail> {
  const user = await requireCapabilityUser();
  if (!canSeeAdminData(user)) throw flowError("FORBIDDEN");
  const parsed = parseInput(AdminTaskInputSchema, input);
  const row = await tasksRepository.createAdminTask(parsed, user.member.id);
  revalidateInicioScreen();
  return row;
}
