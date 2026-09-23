"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import type {
  HistoryEvent,
  TaskAttachment,
  TaskChecklistItem,
  TaskDetail,
  TaskFilters,
  TaskLink,
  TaskLinkInput,
  TaskListItem,
  TaskPatch,
  TaskStatus,
  UserTaskInput,
} from "@/lib/types/core";

async function requireTasksCapabilities() {
  return resolveActivitiesCapabilities(await requireCapabilityUser());
}

function revalidateTareas(projectId?: string) {
  revalidatePath("/tareas");
  revalidatePath("/tablero");
  revalidatePath("/calendario");
  if (projectId) revalidatePath(`/proyectos/${projectId}/ficha`);
}

export async function fetchTasksAction(filters: TaskFilters = {}): Promise<TaskListItem[]> {
  const caps = await requireTasksCapabilities();
  if (!caps.canViewActivities) return [];
  return tasksRepository.listTasks(filters);
}

export async function fetchMyTasksAction(filters: TaskFilters = {}): Promise<TaskListItem[]> {
  const user = await requireCapabilityUser();
  return tasksRepository.listMyTasks(user.member.id, filters);
}

export async function fetchBoardAction(filters: TaskFilters = {}): Promise<Record<TaskStatus, TaskListItem[]>> {
  const caps = await requireTasksCapabilities();
  if (!caps.canViewActivities) {
    return { pendiente: [], en_proceso: [], completado: [], bloqueado: [] };
  }
  return tasksRepository.listBoard(filters);
}

export async function fetchCalendarAction(
  dateFrom: string,
  dateTo: string,
  filters: TaskFilters = {}
): Promise<TaskListItem[]> {
  const caps = await requireTasksCapabilities();
  if (!caps.canViewActivities) return [];
  return tasksRepository.listCalendar(dateFrom, dateTo, filters);
}

export async function fetchTaskAction(id: string): Promise<TaskDetail | null> {
  const caps = await requireTasksCapabilities();
  if (!caps.canViewActivities) return null;
  return tasksRepository.getTask(id);
}

export async function createUserTaskAction(input: UserTaskInput): Promise<TaskDetail> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: task create");
  }
  const row = await tasksRepository.createUserTask(input, user.member.id);
  revalidateTareas(input.projectId);
  return row;
}

export async function updateTaskAction(id: string, patch: TaskPatch): Promise<TaskDetail> {
  const user = await requireCapabilityUser();
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
  const row = await tasksRepository.updateTask(id, patch, user.member.id);
  revalidateTareas(row.projectId);
  return row;
}

export async function setTaskStatusAction(id: string, status: TaskStatus): Promise<TaskDetail> {
  const user = await requireCapabilityUser();
  if (resolveActivitiesCapabilities(user).statusScope === "none") {
    throw new Error("FORBIDDEN: task status change");
  }
  const row = await tasksRepository.setTaskStatus(id, status, user.member.id);
  revalidateTareas(row.projectId);
  return row;
}

export async function assignTaskAction(id: string, managerId: string | null): Promise<TaskDetail> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canChangeResponsible) {
    throw new Error("FORBIDDEN: task reassign");
  }
  const row = await tasksRepository.assignTask(id, managerId, user.member.id);
  revalidateTareas(row.projectId);
  return row;
}

export async function archiveTaskAction(id: string, archived: boolean): Promise<TaskDetail> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: task archive");
  }
  const row = await tasksRepository.setTaskArchived(id, archived, user.member.id);
  revalidateTareas(row.projectId);
  return row;
}

export async function deleteTaskAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canDeleteActivity) {
    throw new Error("FORBIDDEN: task delete");
  }
  await tasksRepository.softDeleteTask(id, user.member.id);
  revalidateTareas();
}

/**
 * Merge duplicate tasks into `keepId`: checklist/support/history move to
 * the survivor, then the duplicates are soft-deleted. Same capability as a
 * plain task delete — merging is destructive to the losing records.
 */
export async function mergeTasksAction(keepId: string, duplicateIds: string[]): Promise<TaskDetail> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canDeleteActivity) {
    throw new Error("FORBIDDEN: task merge");
  }
  const row = await tasksRepository.mergeTasks(keepId, duplicateIds, user.member.id);
  revalidateTareas();
  return row;
}

export async function setTaskSupportAction(taskId: string, staffIds: string[]) {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: task support edit");
  }
  const support = await tasksRepository.setTaskSupport(taskId, staffIds, user.member.id);
  revalidateTareas();
  return support;
}

export async function addChecklistItemAction(taskId: string, title: string): Promise<TaskChecklistItem> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: checklist edit");
  }
  const row = await tasksRepository.addChecklistItem(taskId, title);
  revalidateTareas();
  return row;
}

export async function updateChecklistItemAction(
  id: string,
  patch: { title?: string; completed?: boolean }
): Promise<TaskChecklistItem> {
  await requireCapabilityUser();
  const row = await tasksRepository.updateChecklistItem(id, patch);
  revalidateTareas();
  return row;
}

export async function removeChecklistItemAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canCreateActivity) {
    throw new Error("FORBIDDEN: checklist edit");
  }
  await tasksRepository.removeChecklistItem(id);
  revalidateTareas();
}

export async function reorderChecklistAction(taskId: string, orderedIds: string[]): Promise<void> {
  await requireCapabilityUser();
  await tasksRepository.reorderChecklist(taskId, orderedIds);
  revalidateTareas();
}

export async function reorderProjectTasksAction(projectId: string, orderedTaskIds: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canReorderPhases) {
    throw new Error("FORBIDDEN: tasks reorder");
  }
  await tasksRepository.reorderProjectTasks(projectId, orderedTaskIds);
  revalidateTareas();
}

export async function addTaskCommentAction(taskId: string, comment: string): Promise<HistoryEvent> {
  const user = await requireCapabilityUser();
  const row = await tasksRepository.addTaskComment(taskId, comment, user.member.id);
  revalidateTareas();
  return row;
}

export async function fetchTaskHistoryAction(taskId: string): Promise<HistoryEvent[]> {
  await requireCapabilityUser();
  return tasksRepository.listTaskHistory(taskId);
}

const ATTACHMENT_ERROR_MESSAGES: Record<string, string> = {
  TASK_ATTACHMENT_TYPE_NOT_ALLOWED: "Solo se permiten imágenes o archivos .txt.",
  TASK_ATTACHMENT_TOO_LARGE: "El archivo supera el límite de 10MB.",
};

/** Attaches a file to a task as a comment (#425). Images and .txt only, up to 10MB. */
export async function addTaskAttachmentAction(taskId: string, formData: FormData): Promise<TaskAttachment> {
  const user = await requireCapabilityUser();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("No se recibió ningún archivo.");
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const row = await tasksRepository.addTaskAttachment(
      taskId,
      { name: file.name, mimeType: file.type || "application/octet-stream", data: buffer },
      user.member.id
    );
    revalidateTareas();
    return row;
  } catch (err) {
    const message = err instanceof Error ? ATTACHMENT_ERROR_MESSAGES[err.message] : undefined;
    throw new Error(message ?? "No se pudo adjuntar el archivo.");
  }
}

export async function setTaskCustomStatusAction(id: string, customStatusId: string): Promise<TaskDetail> {
  const user = await requireCapabilityUser();
  if (resolveActivitiesCapabilities(user).statusScope === "none") {
    throw new Error("FORBIDDEN: task status change");
  }
  const row = await tasksRepository.setTaskCustomStatus(id, customStatusId, user.member.id);
  revalidateTareas(row.projectId);
  return row;
}

const LINK_ERROR_MESSAGES: Record<string, string> = {
  TASK_LINK_TITLE_REQUIRED: "Escribe un nombre para el enlace.",
  TASK_LINK_URL_INVALID: "El enlace debe ser una URL válida que empiece con http:// o https://.",
  TASK_LINK_KIND_INVALID: "Elige si el enlace es interno o del cliente.",
};

/** Adds an internal or client Drive/web link to a task (#436). */
export async function addTaskLinkAction(taskId: string, input: TaskLinkInput): Promise<TaskLink> {
  const user = await requireCapabilityUser();
  try {
    const row = await tasksRepository.addTaskLink(taskId, input, user.member.id);
    revalidateTareas();
    return row;
  } catch (err) {
    const message = err instanceof Error ? LINK_ERROR_MESSAGES[err.message] : undefined;
    throw new Error(message ?? "No se pudo agregar el enlace.");
  }
}

export async function removeTaskLinkAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  await tasksRepository.removeTaskLink(id, user.member.id);
  revalidateTareas();
}
