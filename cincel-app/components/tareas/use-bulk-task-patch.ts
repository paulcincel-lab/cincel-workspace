"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { UNDO_LABEL, UNDO_MS, UNDONE_TOAST, type CellValue } from "@/components/widgets/editable-cell";
import { bulkUpdateTasksAction } from "@/lib/actions/tasks-actions";
import { actionErrorText } from "@/lib/errors";
import { qk } from "@/lib/query/keys";
import type { TaskBulkPatch } from "@/lib/types/core";

import {
  bulkInvalidations,
  bulkPatchOf,
  bulkResultToast,
  undoPatches,
  type TaskBulkField,
  type TaskBulkTask,
} from "./task-bulk";

/**
 * One bulk change with its feedback (#1040, #1168): `apply` runs
 * `bulkUpdateTasksAction` for the tasks, refreshes what the change touches,
 * and shows the toast (how many changed, how many were skipped) with Deshacer,
 * which also puts back the subtasks a status change moved along. Shared by
 * `TaskBulkBar` and the Visual board's drag.
 */
export function useBulkTaskPatch(invalidate?: readonly QueryKey[]) {
  const qc = useQueryClient();
  const extra = useRef(invalidate);
  useEffect(() => {
    extra.current = invalidate;
  });
  const lastToast = useRef<string | number | null>(null);

  const refresh = useCallback(
    (changed: readonly TaskBulkTask[], subtaskIds: readonly string[] = []) => {
      for (const queryKey of [...bulkInvalidations(changed, subtaskIds), ...(extra.current ?? [])]) {
        void qc.invalidateQueries({ queryKey });
      }
    },
    [qc],
  );

  const runPatch = useCallback(async (ids: string[], patch: TaskBulkPatch) => {
    try {
      return await bulkUpdateTasksAction(ids, patch);
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  }, []);

  const apply = useCallback(
    async (tasks: readonly TaskBulkTask[], field: TaskBulkField, value: CellValue): Promise<void> => {
      const patch = bulkPatchOf(field, value);
      if (!patch || tasks.length === 0) return;
      const before = tasks;
      const result = await runPatch(
        before.map((t) => t.id),
        patch,
      );
      if (!result.ok) {
        toast.error(actionErrorText(result.error));
        return;
      }
      const changed = before.filter((t) => result.data.updated.includes(t.id));
      const subtaskIds = (result.data.subtasks ?? []).map((s) => s.id);
      refresh(changed, subtaskIds);
      // Planned hours move the calendar's day meters.
      if (field === "horas") void qc.invalidateQueries({ queryKey: qk.calendario.all });
      if (lastToast.current !== null) toast.dismiss(lastToast.current);
      const undo = undoPatches(before, field, result.data.updated, result.data.subtasks);
      lastToast.current = toast(bulkResultToast(result.data), {
        duration: UNDO_MS,
        ...(undo.length > 0
          ? {
              action: {
                label: UNDO_LABEL,
                onClick: () => {
                  void (async () => {
                    // In order: the tasks first, the subtasks last (a parent going back also moves its open subtasks).
                    const results: Awaited<ReturnType<typeof runPatch>>[] = [];
                    for (const u of undo) results.push(await runPatch(u.ids, u.patch));
                    refresh(changed, subtaskIds);
                    if (field === "horas") void qc.invalidateQueries({ queryKey: qk.calendario.all });
                    const failed = results.find((r) => !r.ok);
                    if (failed && !failed.ok) toast.error(actionErrorText(failed.error));
                    else toast(UNDONE_TOAST);
                  })();
                },
              },
            }
          : {}),
      });
    },
    [runPatch, refresh, qc],
  );

  return { apply, refresh };
}
