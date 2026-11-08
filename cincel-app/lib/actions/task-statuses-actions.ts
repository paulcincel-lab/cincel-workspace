"use server";

import { toActionResult } from "@/lib/actions/action-result";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveTaskStatusesCapabilities } from "@/lib/auth/permissions";
import * as taskStatusesRepository from "@/lib/repositories/task-statuses-repository";
import type { TaskStatusInput, TaskStatusOption } from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";

/**
 * Ajustes › Estatus reads through TanStack Query (`ajustes.page('estatus')`):
 * the caller writes the result into it and invalidates the status catalog and
 * the Tareas keys. Nothing is revalidated here.
 */
export async function fetchTaskStatusesAction(): Promise<TaskStatusOption[]> {
  const caps = resolveTaskStatusesCapabilities(await requireCapabilityUser());
  if (!caps.canViewTaskStatuses) return [];
  return taskStatusesRepository.listTaskStatuses();
}

/** `canManageTaskStatuses`. Errors: FORBIDDEN, TASK_STATUS_NAME_REQUIRED, TASK_STATUS_NAME_TAKEN, INVALID. */
export async function createTaskStatusAction(
  ...args: Parameters<typeof createTaskStatusActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createTaskStatusActionImpl>>>> {
  return toActionResult(() => createTaskStatusActionImpl(...args));
}

async function createTaskStatusActionImpl(input: TaskStatusInput): Promise<TaskStatusOption> {
  const user = await requireCapabilityUser();
  if (!resolveTaskStatusesCapabilities(user).canManageTaskStatuses) {
    throw new Error("FORBIDDEN: task statuses create");
  }
  const row = await taskStatusesRepository.createTaskStatus(input);
  return row;
}

/**
 * `canManageTaskStatuses`. Errors: FORBIDDEN, TASK_STATUS_NOT_FOUND,
 * TASK_STATUS_NAME_REQUIRED, TASK_STATUS_NAME_TAKEN, INVALID.
 */
export async function updateTaskStatusAction(
  ...args: Parameters<typeof updateTaskStatusActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateTaskStatusActionImpl>>>> {
  return toActionResult(() => updateTaskStatusActionImpl(...args));
}

async function updateTaskStatusActionImpl(
  id: string,
  patch: Partial<TaskStatusInput>
): Promise<TaskStatusOption> {
  const user = await requireCapabilityUser();
  if (!resolveTaskStatusesCapabilities(user).canManageTaskStatuses) {
    throw new Error("FORBIDDEN: task statuses edit");
  }
  const row = await taskStatusesRepository.updateTaskStatus(id, patch);
  return row;
}

/** `canManageTaskStatuses`. Errors: FORBIDDEN, TASK_STATUS_NOT_FOUND. */
export async function deleteTaskStatusAction(
  ...args: Parameters<typeof deleteTaskStatusActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deleteTaskStatusActionImpl>>>> {
  return toActionResult(() => deleteTaskStatusActionImpl(...args));
}

async function deleteTaskStatusActionImpl(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveTaskStatusesCapabilities(user).canManageTaskStatuses) {
    throw new Error("FORBIDDEN: task statuses delete");
  }
  await taskStatusesRepository.softDeleteTaskStatus(id);
}
