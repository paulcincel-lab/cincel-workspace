"use client";

import { useMemo, useState } from "react";
import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";

import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { resolveTaskStatusesCapabilities } from "@/lib/auth/permissions";
import {
  createTaskStatusAction,
  deleteTaskStatusAction,
  reorderTaskStatusesAction,
  updateTaskStatusAction,
} from "@/lib/actions/task-statuses-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesEstatusOptions, type AjustesEstatusPageData } from "@/lib/query/options/ajustes";
import type { TaskStatus, TaskStatusInput, TaskStatusOption } from "@/lib/types/core";

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
      return { ...current, statuses: current.statuses.filter((status) => status.id !== change.deletedId) };
    }
    const exists = current.statuses.some((status) => status.id === change.saved.id);
    return {
      ...current,
      statuses: exists
        ? current.statuses.map((status) => (status.id === change.saved.id ? change.saved : status))
        : [...current.statuses, change.saved],
    };
  });
}

/** Reorders the cached statuses to `orderedIds` (sortOrder = index) and returns the previous page data for the rollback. */
export async function reorderCachedStatuses(
  qc: QueryClient,
  orderedIds: string[],
): Promise<AjustesEstatusPageData | undefined> {
  const key = qk.ajustes.page("estatus");
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<AjustesEstatusPageData>(key);
  if (previous) {
    const byId = new Map(previous.statuses.map((status) => [status.id, status]));
    const ordered = orderedIds
      .map((id) => byId.get(id))
      .filter((status): status is TaskStatusOption => Boolean(status))
      .map((status, index) => ({ ...status, sortOrder: index }));
    const rest = previous.statuses.filter((status) => !orderedIds.includes(status.id));
    qc.setQueryData<AjustesEstatusPageData>(key, { ...previous, statuses: [...ordered, ...rest] });
  }
  return previous;
}

/** The tag that sends an inline-added status to Completado. */
const COMPLETADO_TAG = /(^|\s)#completado(?=\s|$)/i;

/**
 * The inline add row's text: "Revisión cliente" → En proceso (doesn't close);
 * "Entregado #completado" → Completado (closes, counts as completed). The tag
 * is removed from the name.
 */
export function parseInlineStatus(text: string): { name: string; closes: boolean } {
  const closes = COMPLETADO_TAG.test(text);
  const name = text.replace(new RegExp(COMPLETADO_TAG.source, "gi"), " ").replace(/\s+/g, " ").trim();
  return { name, closes };
}

const NO_BASE_COUNTS: Record<TaskStatus, number> = { pendiente: 0, en_proceso: 0, completado: 0, bloqueado: 0 };
const NO_USAGE: Record<string, { tasks: number; projects: number }> = {};

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
  const data = useSuspenseQuery(ajustesEstatusOptions()).data;
  const { statuses } = data;
  const baseCounts = data.baseCounts ?? NO_BASE_COUNTS;
  const customUsage = data.customUsage ?? NO_USAGE;
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

  // The inline add row: one POST, its error as a toast (the row keeps the text).
  const quickCreateMutation = useActionMutation((input: TaskStatusInput) => createTaskStatusAction(input), {
    setData: (qc, saved) => patchEstatusPage(qc, { saved }),
    invalidate: TASK_STATUS_INVALIDATIONS,
  });

  const reorderMutation = useActionMutation((orderedIds: string[]) => reorderTaskStatusesAction(orderedIds), {
    optimistic: {
      onMutate: (qc, orderedIds) => reorderCachedStatuses(qc, orderedIds),
      rollback: (qc, previous) => {
        if (previous) qc.setQueryData(qk.ajustes.page("estatus"), previous);
      },
    },
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

  /** Deletes a status (no confirmation here: the page asks); true when it was deleted. A failure shows as a toast. */
  async function remove(status: TaskStatusOption): Promise<boolean> {
    try {
      await removeMutation.mutateAsync(status.id);
      if (editing?.id === status.id) setShowEditor(false);
      return true;
    } catch {
      // `useActionMutation` already showed the error toast.
      return false;
    }
  }

  /**
   * Creates a status from the inline add row's text (`parseInlineStatus`):
   * appended last. Resolves the new status; throws when the name is empty or
   * the save failed (the row keeps its text).
   */
  async function createQuick(text: string): Promise<TaskStatusOption> {
    const { name: parsedName, closes: parsedCloses } = parseInlineStatus(text);
    if (!parsedName) throw new Error("TASK_STATUS_NAME_REQUIRED");
    return quickCreateMutation.mutateAsync({
      name: parsedName,
      closes: parsedCloses,
      countsAsCompleted: parsedCloses,
      sortOrder: statuses.length,
    });
  }

  /** Persists a new order (drag or keyboard): optimistic, rolled back with a toast on failure. */
  function reorder(orderedIds: string[]) {
    reorderMutation.mutate(orderedIds);
  }

  return {
    statuses,
    baseCounts,
    customUsage,
    createQuick,
    reorder,
    isDeleting: removeMutation.isPending,
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
