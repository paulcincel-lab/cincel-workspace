"use client";

import { useMemo, useState } from "react";
import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";

import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { resolveTaskStatusesCapabilities } from "@/lib/auth/permissions";
import {
  createTaskStatusAction,
  deleteTaskStatusAction,
  updateTaskStatusAction,
} from "@/lib/actions/task-statuses-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesEstatusOptions, type AjustesEstatusPageData } from "@/lib/query/options/ajustes";
import type { TaskStatusInput, TaskStatusOption } from "@/lib/types/core";

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
 * What a status change makes stale (plan §3, Task statuses): the catalog, the
 * Tareas board columns, every task sheet, the Monday status choices, Inicio
 * and the Proyectos list. `ajustes.page('estatus')` itself is written from
 * the result instead (`patchEstatusPage`), so the list is not refetched.
 */
export const TASK_STATUS_INVALIDATIONS = [
  qk.catalog.taskStatuses(),
  qk.tareas.all,
  ["tasks"],
  qk.monday.choices(),
  qk.inicio(),
  qk.proyectos.list(),
] as const;

/** Applies a saved or deleted status to the cached `ajustes.page('estatus')` list. */
export function patchEstatusPage(
  qc: QueryClient,
  change: { saved: TaskStatusOption } | { deletedId: string },
): void {
  qc.setQueryData<AjustesEstatusPageData>(qk.ajustes.page("estatus"), (current) => {
    if (!current) return current;
    if ("deletedId" in change) {
      return { statuses: current.statuses.filter((status) => status.id !== change.deletedId) };
    }
    const exists = current.statuses.some((status) => status.id === change.saved.id);
    return {
      statuses: exists
        ? current.statuses.map((status) => (status.id === change.saved.id ? change.saved : status))
        : [...current.statuses, change.saved],
    };
  });
}

type SaveVars = { id: string | null; input: TaskStatusInput };

/** One save: an update when `id` is set, else a create. */
function saveTaskStatus({ id, input }: SaveVars) {
  return id ? updateTaskStatusAction(id, input) : createTaskStatusAction(input);
}

/**
 * State and actions of the custom task statuses editor (Ajustes › Estatus).
 * The list is `qk.ajustes.page('estatus')`, hydrated by the page: no fetch on
 * mount, and each save or delete is one POST that writes its result into the
 * cache and invalidates `TASK_STATUS_INVALIDATIONS`.
 */
export function useTaskStatusesEditor() {
  const { statuses } = useSuspenseQuery(ajustesEstatusOptions()).data;
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

  const saveMutation = useActionMutation(saveTaskStatus, {
    setData: (qc, saved) => patchEstatusPage(qc, { saved }),
    invalidate: TASK_STATUS_INVALIDATIONS,
    // The editor shows the error inline with the status copy (`save()`), not as a toast.
    onFormError: () => undefined,
  });

  const removeMutation = useActionMutation((id: string) => deleteTaskStatusAction(id), {
    setData: (qc, _data, id) => patchEstatusPage(qc, { deletedId: id }),
    invalidate: TASK_STATUS_INVALIDATIONS,
  });

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
    setFormError("");
    const input = { name, closes, countsAsCompleted: closes && countsAsCompleted };
    try {
      await saveMutation.mutateAsync(
        editing ? { id: editing.id, input } : { id: null, input: { ...input, sortOrder: statuses.length } },
      );
      setShowEditor(false);
      return true;
    } catch (error) {
      setFormError(taskStatusErrorMessage(error, "No se pudo guardar el estatus."));
      return false;
    }
  }

  /** Deletes a status (no confirmation here: the page asks). A failure shows as a toast. */
  async function remove(status: TaskStatusOption) {
    try {
      await removeMutation.mutateAsync(status.id);
    } catch {
      // `useActionMutation` already showed the error toast.
    }
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
    isSaving: saveMutation.isPending,
    openEditor,
    save,
    remove,
  };
}
