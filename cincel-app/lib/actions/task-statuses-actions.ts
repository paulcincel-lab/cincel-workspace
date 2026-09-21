"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveTaskStatusesCapabilities } from "@/lib/auth/permissions";
import * as taskStatusesRepository from "@/lib/repositories/task-statuses-repository";
import type { TaskStatusInput, TaskStatusOption } from "@/lib/types/core";

function revalidateStatuses() {
  revalidatePath("/configuracion/estatus");
  revalidatePath("/actividades", "layout");
}

export async function fetchTaskStatusesAction(): Promise<TaskStatusOption[]> {
  const caps = resolveTaskStatusesCapabilities(await requireCapabilityUser());
  if (!caps.canViewTaskStatuses) return [];
  return taskStatusesRepository.listTaskStatuses();
}

export async function createTaskStatusAction(input: TaskStatusInput): Promise<TaskStatusOption> {
  const user = await requireCapabilityUser();
  if (!resolveTaskStatusesCapabilities(user).canManageTaskStatuses) {
    throw new Error("FORBIDDEN: task statuses create");
  }
  const row = await taskStatusesRepository.createTaskStatus(input);
  revalidateStatuses();
  return row;
}

export async function updateTaskStatusAction(
  id: string,
  patch: Partial<TaskStatusInput>
): Promise<TaskStatusOption> {
  const user = await requireCapabilityUser();
  if (!resolveTaskStatusesCapabilities(user).canManageTaskStatuses) {
    throw new Error("FORBIDDEN: task statuses edit");
  }
  const row = await taskStatusesRepository.updateTaskStatus(id, patch);
  revalidateStatuses();
  return row;
}

export async function deleteTaskStatusAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveTaskStatusesCapabilities(user).canManageTaskStatuses) {
    throw new Error("FORBIDDEN: task statuses delete");
  }
  await taskStatusesRepository.softDeleteTaskStatus(id);
  revalidateStatuses();
}
