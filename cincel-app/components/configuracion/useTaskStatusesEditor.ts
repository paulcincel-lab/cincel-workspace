"use client";

import { useEffect, useMemo, useState } from "react";

import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { resolveTaskStatusesCapabilities } from "@/lib/auth/permissions";
import {
  createTaskStatusAction,
  deleteTaskStatusAction,
  fetchTaskStatusesAction,
  updateTaskStatusAction,
} from "@/lib/actions/task-statuses-actions";
import type { TaskStatusOption } from "@/lib/types/core";

export const TASK_STATUS_ERROR_MESSAGES: Record<string, string> = {
  TASK_STATUS_NAME_REQUIRED: "El nombre del estatus es obligatorio.",
  TASK_STATUS_NAME_TAKEN: "Ya existe un estatus con ese nombre.",
};

/** Copy for a task-status save error: the status codes above, else `fallback`. */
export function taskStatusErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return TASK_STATUS_ERROR_MESSAGES[error.message] ?? fallback;
}

/** Initial values of the editor when it opens for a new status. */
export type TaskStatusDraftDefaults = { closes?: boolean };

/**
 * State and actions of the custom task statuses editor, shared by the legacy
 * Configuración › Estatus page (`EstatusClient`) and Ajustes › Estatus
 * (`EstatusSettings`). Both pages call the same server actions with the same
 * payloads; only the markup differs.
 */
export function useTaskStatusesEditor(initialStatuses: TaskStatusOption[]) {
  const [statuses, setStatuses] = useState<TaskStatusOption[]>(initialStatuses);
  const authenticatedUser = useSessionStore(selectCurrentUser);
  const capabilities = useMemo(
    () => resolveTaskStatusesCapabilities(authenticatedUser),
    [authenticatedUser],
  );

  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<TaskStatusOption | null>(null);
  const [name, setName] = useState("");
  const [closes, setCloses] = useState(false);
  const [countsAsCompleted, setCountsAsCompleted] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function refresh() {
    setStatuses(await fetchTaskStatusesAction());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  function openEditor(status: TaskStatusOption | null, defaults: TaskStatusDraftDefaults = {}) {
    const initialCloses = status?.closes ?? defaults.closes ?? false;
    setEditing(status);
    setName(status?.name ?? "");
    setCloses(initialCloses);
    // A new closing status counts as finished work unless it is turned off.
    setCountsAsCompleted(status ? status.countsAsCompleted : initialCloses);
    setFormError("");
    setShowEditor(true);
  }

  function changeCloses(next: boolean) {
    setCloses(next);
    // A status that stays open never counts as finished work.
    setCountsAsCompleted(next);
  }

  /** Saves the editor; resolves true when it saved (the editor is then closed). */
  async function save(): Promise<boolean> {
    if (!name.trim()) {
      setFormError(TASK_STATUS_ERROR_MESSAGES.TASK_STATUS_NAME_REQUIRED);
      return false;
    }
    setIsSaving(true);
    setFormError("");
    try {
      if (editing)
        await updateTaskStatusAction(editing.id, {
          name,
          closes,
          countsAsCompleted: closes && countsAsCompleted,
        });
      else
        await createTaskStatusAction({
          name,
          closes,
          countsAsCompleted: closes && countsAsCompleted,
          sortOrder: statuses.length,
        });
      await refresh();
      setShowEditor(false);
      return true;
    } catch (error) {
      setFormError(taskStatusErrorMessage(error, "No se pudo guardar el estatus."));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  /** Deletes a status (no confirmation here: each page asks in its own way). */
  async function remove(status: TaskStatusOption) {
    await deleteTaskStatusAction(status.id);
    await refresh();
  }

  return {
    statuses,
    capabilities,
    showEditor,
    setShowEditor,
    editing,
    name,
    setName,
    closes,
    changeCloses,
    countsAsCompleted,
    setCountsAsCompleted,
    formError,
    isSaving,
    openEditor,
    save,
    remove,
  };
}
