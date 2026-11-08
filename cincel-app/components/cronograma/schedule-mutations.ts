"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import * as scheduleActions from "@/lib/actions/schedule-actions";
import type { ScheduleViewData } from "@/lib/actions/schedule-actions";
import {
  patchAddImprevisto,
  patchRemoveImprevisto,
  patchReplaceImprevisto,
  patchTaskFlag,
  patchTaskStatus,
} from "@/lib/cronograma/optimistic";
import { mutationErrorText, useActionMutation } from "@/lib/query/mutation";
import { qk } from "@/lib/query/keys";
import type {
  ActionResult,
  Imprevisto,
  ImportDiffSummary,
  LegacyStateApplyResult,
  ScheduleStatus,
  ScheduleTask,
} from "@/lib/types/schedule";

import { STATUS_LABEL } from "./task-card";

/**
 * The Cronograma mutations on `qk.proyectos.cronograma(projectId)` (plan §3
 * Schedule, #961). The schedule actions return `ActionResult` /
 * `SetTaskStatusResult` with their own Spanish copy, so a failed result is
 * thrown as a `ScheduleActionError` carrying that copy, and the copy reaches
 * the caller's inline alert through `report`. `useActionMutation` handles the
 * optimistic patch, the rollback and the invalidations; its own error copy is
 * not shown (`onFormError` is a no-op) because the caller already has the
 * action's text.
 */

/** A failed schedule action result; `message` is the action's user-facing copy. */
export class ScheduleActionError extends Error {}

/** `setTaskStatusAction` found another status than the one the screen showed. */
export class ScheduleConflictError extends Error {
  constructor(readonly current: ScheduleStatus) {
    super(`CONFLICT: ${current}`);
  }
}

/** The copy for a schedule mutation error: the action's own text, the conflict message, or the generic copy. */
export function scheduleErrorText(err: unknown): string {
  if (err instanceof ScheduleConflictError) {
    return `Esta tarea ya cambió de estado (ahora: ${STATUS_LABEL[err.current]}). Se actualizó la vista.`;
  }
  if (err instanceof ScheduleActionError) return err.message;
  return mutationErrorText(err);
}

/** The data of an `ActionResult`; a failed one throws its copy as a `ScheduleActionError`. */
export function unwrapScheduleResult<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new ScheduleActionError(result.error);
  return result.data;
}

/** Wraps a mutation function so its error copy reaches `report` before the error propagates. */
function reporting<V, R>(run: (vars: V) => Promise<R>, report: (text: string) => void): (vars: V) => Promise<R> {
  return async (vars) => {
    try {
      return await run(vars);
    } catch (err) {
      report(scheduleErrorText(err));
      throw err;
    }
  };
}

const showNothing = () => undefined;

type View = ScheduleViewData | null | undefined;

function patchView(qc: QueryClient, projectId: string, patch: (view: ScheduleViewData) => ScheduleViewData): void {
  qc.setQueryData<ScheduleViewData | null>(qk.proyectos.cronograma(projectId), (view: View) =>
    view ? patch(view) : view,
  );
}

async function cancelView(qc: QueryClient, projectId: string): Promise<void> {
  await qc.cancelQueries({ queryKey: qk.proyectos.cronograma(projectId) });
}

// ── Task status and flag ─────────────────────────────────────────────────────

export type SetStatusVars = { task: ScheduleTask; next: ScheduleStatus };
export type ToggleFlagVars = { task: ScheduleTask };
type TaskSnap<T> = { taskId: string; previous: T };

/**
 * Status and flag changes, optimistic on `proyectos.cronograma(pid)` (#947):
 * the cache is patched before the POST and kept after it resolves; an error
 * patches the task back, a conflict also refetches the schedule. On settle
 * `proyectos.resumen(pid)` and `proyectos.list` are invalidated. The rollback
 * restores only the task it changed, so overlapping changes on other tasks
 * survive it.
 */
export function useScheduleTaskMutations(projectId: string, report: (text: string) => void) {
  const qc = useQueryClient();
  const invalidate = [qk.proyectos.resumen(projectId), qk.proyectos.list()] as const;

  const setStatus = useActionMutation<SetStatusVars, ScheduleStatus, TaskSnap<ScheduleStatus>>(
    reporting(async ({ task, next }: SetStatusVars) => {
      const result = await scheduleActions.setTaskStatusAction(task.id, next, task.status);
      if (result.ok) return result.status;
      if (result.conflict) throw new ScheduleConflictError(result.current);
      throw new ScheduleActionError(result.error);
    }, report),
    {
      optimistic: {
        async onMutate(client, { task, next }) {
          await cancelView(client, projectId);
          patchView(client, projectId, (view) => patchTaskStatus(view, task.id, next));
          return { taskId: task.id, previous: task.status };
        },
        rollback(client, snap) {
          patchView(client, projectId, (view) => patchTaskStatus(view, snap.taskId, snap.previous));
        },
      },
      invalidate,
      onFormError: showNothing,
      staleCodes: ["CONFLICT"],
      onStaleError: () => {
        void qc.refetchQueries({ queryKey: qk.proyectos.cronograma(projectId) });
      },
    },
  );

  const toggleFlag = useActionMutation<ToggleFlagVars, { flagged: boolean }, TaskSnap<boolean>>(
    reporting(
      async ({ task }: ToggleFlagVars) => unwrapScheduleResult(await scheduleActions.toggleTaskFlagAction(task.id)),
      report,
    ),
    {
      optimistic: {
        async onMutate(client, { task }) {
          await cancelView(client, projectId);
          patchView(client, projectId, (view) => patchTaskFlag(view, task.id, !task.flagged));
          return { taskId: task.id, previous: task.flagged };
        },
        rollback(client, snap) {
          patchView(client, projectId, (view) => patchTaskFlag(view, snap.taskId, snap.previous));
        },
      },
      // The server toggles; the cache keeps what it answered.
      setData: (client, data, { task }) => patchView(client, projectId, (view) => patchTaskFlag(view, task.id, data.flagged)),
      invalidate,
      onFormError: showNothing,
    },
  );

  return { setStatus, toggleFlag };
}

// ── Imprevistos ──────────────────────────────────────────────────────────────

export type AddImprevistoVars = { scheduleId: string; fecha: string; texto: string; tempId: string };
export type DeleteImprevistoVars = { item: Imprevisto };

/**
 * Marks the schedule stale without refetching it: the cache already holds the
 * server's answer, so the add or delete stays one POST, and the next reader
 * after a mount or a navigation loads it again.
 */
function markViewStale(qc: QueryClient, projectId: string): void {
  void qc.invalidateQueries({ queryKey: qk.proyectos.cronograma(projectId), refetchType: "none" });
}

/**
 * Imprevistos add and delete, optimistic on the `proyectos.cronograma(pid)`
 * imprevistos list: an add shows a temporary row that the saved one
 * replaces; an error takes the change back.
 */
export function useImprevistoMutations(projectId: string, report: (text: string) => void) {
  const add = useActionMutation<AddImprevistoVars, Imprevisto, { tempId: string }>(
    reporting(
      async ({ scheduleId, fecha, texto }: AddImprevistoVars) =>
        unwrapScheduleResult(await scheduleActions.addImprevistoAction(scheduleId, { fecha, texto })),
      report,
    ),
    {
      optimistic: {
        async onMutate(client, { tempId, fecha, texto }) {
          await cancelView(client, projectId);
          patchView(client, projectId, (view) => patchAddImprevisto(view, { id: tempId, fecha, texto }));
          return { tempId };
        },
        rollback(client, snap) {
          patchView(client, projectId, (view) => patchRemoveImprevisto(view, snap.tempId));
        },
      },
      setData: (client, item, { tempId }) => {
        patchView(client, projectId, (view) => patchReplaceImprevisto(view, tempId, item));
        markViewStale(client, projectId);
      },
      onFormError: showNothing,
    },
  );

  const remove = useActionMutation<DeleteImprevistoVars, { id: string }, { item: Imprevisto }>(
    reporting(
      async ({ item }: DeleteImprevistoVars) => unwrapScheduleResult(await scheduleActions.deleteImprevistoAction(item.id)),
      report,
    ),
    {
      optimistic: {
        async onMutate(client, { item }) {
          await cancelView(client, projectId);
          patchView(client, projectId, (view) => patchRemoveImprevisto(view, item.id));
          return { item };
        },
        rollback(client, snap) {
          patchView(client, projectId, (view) => patchAddImprevisto(view, snap.item));
        },
      },
      setData: (client) => markViewStale(client, projectId),
      onFormError: showNothing,
    },
  );

  return { add, remove };
}

// ── Import ───────────────────────────────────────────────────────────────────

/** What an import changes: the schedule, the Resumen card, the list's progress and the project header. */
function importInvalidations(projectId: string) {
  return [
    qk.proyectos.cronograma(projectId),
    qk.proyectos.resumen(projectId),
    qk.proyectos.list(),
    qk.proyectos.shell(projectId),
  ] as const;
}

/**
 * The import dialog's calls. The preview is a read: a plain `useMutation`
 * with no invalidation. The Excel commit and the legacy JSON apply
 * invalidate `importInvalidations`.
 */
export function useScheduleImportMutations(
  projectId: string,
  reports: { excel: (text: string) => void; legacy: (text: string) => void },
) {
  const preview = useMutation<ImportDiffSummary, Error, FormData>({
    mutationFn: reporting(
      async (formData: FormData) =>
        unwrapScheduleResult(await scheduleActions.previewImportScheduleAction(projectId, formData)),
      reports.excel,
    ),
  });

  const commit = useActionMutation<FormData, ImportDiffSummary>(
    reporting(
      async (formData: FormData) => unwrapScheduleResult(await scheduleActions.commitImportScheduleAction(projectId, formData)),
      reports.excel,
    ),
    { invalidate: importInvalidations(projectId), onFormError: showNothing },
  );

  const applyLegacy = useActionMutation<{ scheduleId: string; rawJson: string }, LegacyStateApplyResult>(
    reporting(
      async ({ scheduleId, rawJson }: { scheduleId: string; rawJson: string }) =>
        unwrapScheduleResult(await scheduleActions.importLegacyStateAction(scheduleId, rawJson)),
      reports.legacy,
    ),
    { invalidate: importInvalidations(projectId), onFormError: showNothing },
  );

  return { preview, commit, applyLegacy };
}
