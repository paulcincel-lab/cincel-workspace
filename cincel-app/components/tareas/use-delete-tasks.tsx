"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { ConfirmDeleteDialog } from "@/components/widgets/ConfirmDeleteDialog";
import { UNDO_LABEL } from "@/components/widgets/editable-cell";
import { DELETE_LABEL, OPEN_LABEL, type TableRowAction } from "@/components/widgets/table-rows";
import { deleteTaskAction, restoreTaskAction } from "@/lib/actions/tasks-actions";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import { taskDeleteInvalidations } from "@/lib/query/options/tareas";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { ActionResult } from "@/lib/types/schedule";

import {
  BULK_DELETE_CONFIRM,
  BULK_DELETED_TOAST,
  TASK_DELETE_CONFIRM,
  TASK_DELETED_TOAST,
  TASK_DELETE_UNDO_MS,
  TASK_RESTORED_TOAST,
} from "./task-table-copy";

/** A task a table row stands for, as the delete needs it. */
export type DeleteTaskTarget = { id: string; title: string; projectId: string | null };

/** The delete target of a task row (any task shape with id, title and project). */
export function deleteTargetOf(task: { id: string; title: string; projectId: string | null }): DeleteTaskTarget {
  return { id: task.id, title: task.title, projectId: task.projectId };
}

export type DeleteTasksRequestOptions = {
  /** After the server confirmed the delete, with the ids that went (e.g. clear the selection). */
  onDeleted?(ids: string[]): void;
};

export type DeleteTasks = {
  /** `canDeleteActivity`: without it no table offers Eliminar and `request` does nothing. */
  canDelete: boolean;
  /** Opens the confirmation for one task (its title) or several (the count). */
  request(targets: DeleteTaskTarget[], options?: DeleteTasksRequestOptions): void;
  /** The ids removed optimistically (and not restored); tables drop these rows. */
  hiddenIds: ReadonlySet<string>;
  /** True for a hidden task or a subtask of one (subtasks go with their parent). */
  isHidden(id: string, parentId?: string | null): boolean;
  /** The row's `⋯` entries: "Abrir" when `open` is given, "Eliminar" when the viewer may delete. */
  rowActions(target: DeleteTaskTarget, open?: () => void): TableRowAction[];
  /** The confirmation dialog: render it once next to the table. */
  dialog: ReactNode;
};

type Pending = { targets: DeleteTaskTarget[]; options?: DeleteTasksRequestOptions };

const failure = (error: unknown): ActionResult<void> => ({
  ok: false,
  error: error instanceof Error ? error.message : String(error),
});

function invalidationsOf(targets: DeleteTaskTarget[], extra: readonly QueryKey[]): QueryKey[] {
  const seen = new Set<string>();
  const keys: QueryKey[] = [];
  const projectIds = [...new Set(targets.map((t) => t.projectId))];
  for (const key of [...projectIds.flatMap((id) => taskDeleteInvalidations(id)), ...extra]) {
    const id = JSON.stringify(key);
    if (seen.has(id)) continue;
    seen.add(id);
    keys.push(key);
  }
  return keys;
}

/**
 * Delete tasks from a table (#1041): the in-page confirmation ("¿Eliminar
 * «título»? Se eliminan también sus subtareas."), then the rows (and their
 * subtasks) disappear right away while `deleteTaskAction` runs, with a 5 s
 * "Deshacer" toast that calls `restoreTaskAction`. Failed deletes come back
 * with an error toast. The same flow serves the row menu, Supr and the bulk
 * bar (several targets: "¿Eliminar n tareas?").
 */
export type UseDeleteTasksOptions = {
  /** Keys the page reads beyond `taskDeleteInvalidations` (e.g. the project's Resumen). */
  invalidate?: readonly QueryKey[];
};

export function useDeleteTasks(options: UseDeleteTasksOptions = {}): DeleteTasks {
  const qc = useQueryClient();
  const user = useSessionStore(selectAuthenticatedUser);
  const canDelete = useMemo(() => resolveActivitiesCapabilities(user).canDeleteActivity, [user]);
  // `pending` outlives `open` so the dialog keeps its question while it closes.
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(() => new Set());
  const lastToast = useRef<string | number | null>(null);
  const extraKeys = useRef<readonly QueryKey[]>([]);
  useEffect(() => {
    extraKeys.current = options.invalidate ?? [];
  });

  const hide = useCallback((ids: string[], hidden: boolean) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (hidden) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const refresh = useCallback(
    (targets: DeleteTaskTarget[]) => {
      for (const queryKey of invalidationsOf(targets, extraKeys.current)) void qc.invalidateQueries({ queryKey });
    },
    [qc],
  );

  const undo = useCallback(
    async (targets: DeleteTaskTarget[]) => {
      const results = await Promise.all(targets.map((t) => restoreTaskAction(t.id).catch(failure)));
      const restored = targets.filter((_, i) => results[i].ok);
      hide(
        restored.map((t) => t.id),
        false,
      );
      refresh(restored);
      const failed = results.find((r): r is { ok: false; error: string } => !r.ok);
      if (failed) toast.error(actionErrorText(failed.error));
      else toast(TASK_RESTORED_TOAST);
    },
    [hide, refresh],
  );

  const run = useCallback(
    async ({ targets, options }: Pending) => {
      const ids = targets.map((t) => t.id);
      hide(ids, true);
      const results = await Promise.all(targets.map((t) => deleteTaskAction(t.id).catch(failure)));
      const deleted = targets.filter((_, i) => results[i].ok);
      const kept = targets.filter((_, i) => !results[i].ok);
      if (kept.length > 0) {
        hide(
          kept.map((t) => t.id),
          false,
        );
        const failed = results.find((r): r is { ok: false; error: string } => !r.ok);
        toast.error(actionErrorText(failed?.error));
      }
      if (deleted.length === 0) return;
      for (const t of deleted) qc.removeQueries({ queryKey: qk.tasks.detail(t.id), exact: true });
      refresh(deleted);
      options?.onDeleted?.(deleted.map((t) => t.id));
      if (lastToast.current !== null) toast.dismiss(lastToast.current);
      lastToast.current = toast(targets.length === 1 ? TASK_DELETED_TOAST : BULK_DELETED_TOAST(deleted.length), {
        duration: TASK_DELETE_UNDO_MS,
        action: { label: UNDO_LABEL, onClick: () => void undo(deleted) },
      });
    },
    [hide, qc, refresh, undo],
  );

  const request = useCallback(
    (targets: DeleteTaskTarget[], options?: DeleteTasksRequestOptions) => {
      if (!canDelete || targets.length === 0) return;
      setPending({ targets, options });
      setOpen(true);
    },
    [canDelete],
  );

  const isHidden = useCallback(
    (id: string, parentId?: string | null) => hiddenIds.has(id) || (parentId != null && hiddenIds.has(parentId)),
    [hiddenIds],
  );

  const rowActions = useCallback(
    (target: DeleteTaskTarget, open?: () => void): TableRowAction[] => [
      ...(open ? [{ id: "abrir", label: OPEN_LABEL, onSelect: open }] : []),
      ...(canDelete
        ? [{ id: "eliminar", label: DELETE_LABEL, destructive: true, onSelect: () => request([target]) }]
        : []),
    ],
    [canDelete, request],
  );

  const title = pending
    ? pending.targets.length === 1
      ? TASK_DELETE_CONFIRM(pending.targets[0].title)
      : BULK_DELETE_CONFIRM(pending.targets.length)
    : "";

  const dialog = (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
      title={title}
      onConfirm={() => {
        if (!pending || !open) return;
        setOpen(false);
        void run(pending);
      }}
    />
  );

  return { canDelete, request, hiddenIds, isHidden, rowActions, dialog };
}
