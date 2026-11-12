"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueries, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/shadcn/button";
import { BULK_BAR_BUTTON_CLASS, BulkActionBar, type BulkBarAction } from "@/components/widgets/BulkActionBar";
import { CellEditor } from "@/components/widgets/CellEditor";
import { UNDO_LABEL, UNDO_MS, UNDONE_TOAST, type AnyCellEdit, type CellValue } from "@/components/widgets/editable-cell";
import { DELETE_LABEL } from "@/components/widgets/table-rows";
import { bulkUpdateTasksAction } from "@/lib/actions/tasks-actions";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { actionErrorText } from "@/lib/errors";
import { catalogTaskStatusesOptions } from "@/lib/query/options/catalog";
import { taskPhasesOptions } from "@/lib/query/options/tareas";
import { qk } from "@/lib/query/keys";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { StaffRef, TaskBulkPatch, TaskStatusOption, WorkflowPhaseRef } from "@/lib/types/core";

import {
  TASK_BULK_FIELDS,
  bulkInvalidations,
  bulkPatchOf,
  bulkPhaseOptions,
  bulkResultToast,
  commonValue,
  undoPatches,
  type TaskBulkField,
  type TaskBulkTask,
} from "./task-bulk";
import { HOURS_FALLBACK, HOURS_MAX, HOURS_MIN, HOURS_STEP, formatHours } from "./task-hours";
import { taskCellOptions, type TaskCellCatalogs } from "./task-cell-edits";
import {
  BULK_DUE_LABEL,
  BULK_HOURS_LABEL,
  HOURS_RANGE_ERROR,
  BULK_PHASE_LABEL,
  BULK_RESPONSIBLE_LABEL,
  BULK_STATUS_LABEL,
  BULK_SUPPORT_LABEL,
} from "./task-table-copy";
import type { TaskSelection } from "./use-task-selection";
import type { DeleteTaskTarget, DeleteTasks } from "./use-delete-tasks";

/**
 * The bulk bar of a task table (#1040): `BulkActionBar` with a picker per
 * field (Estatus, Responsable, Apoyo, Fase, Vence, Horas estimadas; the same `CellEditor` the
 * cells open) and Eliminar. A pick runs one `bulkUpdateTasksAction` for the
 * selected tasks; the toast says how many changed and how many were skipped
 * for permission, with Deshacer (the previous values, one call per value).
 * Eliminar goes through the table's delete flow (`useDeleteTasks`). Fields the
 * viewer can't change at all are not offered.
 */
export type TaskBulkBarProps = {
  selection: TaskSelection;
  /** The task a selected id stands for (ids it doesn't know are left out). */
  taskOf(id: string): TaskBulkTask | undefined;
  /** Responsable and Apoyo options. */
  staff: readonly StaffRef[];
  /** The table's delete flow; without it there is no Eliminar. */
  deletes?: Pick<DeleteTasks, "canDelete" | "request">;
  /** Keys the page reads beyond the Tareas, project and Mi espacio ones (`bulkInvalidations`). */
  invalidate?: readonly QueryKey[];
  /** Fields to leave out (e.g. Fase in a table without fases). */
  hide?: readonly TaskBulkField[];
};

const LABEL: Record<TaskBulkField, string> = {
  estatus: BULK_STATUS_LABEL,
  responsable: BULK_RESPONSIBLE_LABEL,
  apoyo: BULK_SUPPORT_LABEL,
  fase: BULK_PHASE_LABEL,
  vence: BULK_DUE_LABEL,
  horas: BULK_HOURS_LABEL,
};

const NO_STATUSES: TaskStatusOption[] = [];
const NO_PHASES: WorkflowPhaseRef[] = [];
const NO_TASKS: TaskBulkTask[] = [];
const noCommit = async () => ({ ok: true as const, data: null });

export function TaskBulkBar({ selection, taskOf, staff, deletes, invalidate, hide }: TaskBulkBarProps): ReactNode {
  const qc = useQueryClient();
  const user = useSessionStore(selectAuthenticatedUser);
  const caps = useMemo(() => resolveActivitiesCapabilities(user), [user]);
  const active = selection.count > 0;

  const tasks = useMemo(() => {
    if (!active) return NO_TASKS;
    return [...selection.selectedIds].map(taskOf).filter((t): t is TaskBulkTask => t !== undefined);
  }, [active, selection.selectedIds, taskOf]);

  // ── Catalogs: the custom statuses and the fases of the selected tasks' tramos, while the bar shows.
  const statuses = useQuery({ ...catalogTaskStatusesOptions(), enabled: active }).data ?? NO_STATUSES;
  const tramoIds = useMemo(() => [...new Set(tasks.flatMap((t) => (t.workflowId ? [t.workflowId] : [])))], [tasks]);
  const phaseData = useQueries({
    queries: tramoIds.map((id) => ({ ...taskPhasesOptions(id), enabled: active })),
    combine: (results) => results.map((r) => r.data),
  });
  const phasesOf = useCallback(
    (id: string): readonly WorkflowPhaseRef[] => phaseData[tramoIds.indexOf(id)] ?? NO_PHASES,
    [phaseData, tramoIds],
  );
  const catalogs = useMemo<TaskCellCatalogs>(
    () => ({ tramos: [], phasesOf: () => [], statuses, staff: [...staff], spacesOf: () => [] }),
    [statuses, staff],
  );

  const allowed: Record<TaskBulkField, boolean> = {
    estatus: caps.statusScope !== "none",
    responsable: caps.canChangeResponsible,
    apoyo: caps.canChangeResponsible,
    fase: caps.canCreateActivity,
    vence: caps.canCreateActivity,
    horas: caps.canCreateActivity,
  };
  const fields = TASK_BULK_FIELDS.filter((field) => allowed[field] && !hide?.includes(field));

  // ── Saves.
  const extra = useRef(invalidate);
  useEffect(() => {
    extra.current = invalidate;
  });
  const refresh = useCallback(
    (changed: readonly TaskBulkTask[]) => {
      for (const queryKey of [...bulkInvalidations(changed), ...(extra.current ?? [])]) {
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

  const lastToast = useRef<string | number | null>(null);
  const apply = useCallback(
    async (field: TaskBulkField, value: CellValue) => {
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
      refresh(changed);
      // Planned hours move the calendar's day meters.
      if (field === "horas") void qc.invalidateQueries({ queryKey: qk.calendario.all });
      if (lastToast.current !== null) toast.dismiss(lastToast.current);
      const undo = undoPatches(before, field, result.data.updated);
      lastToast.current = toast(bulkResultToast(result.data), {
        duration: UNDO_MS,
        ...(undo.length > 0
          ? {
              action: {
                label: UNDO_LABEL,
                onClick: () => {
                  void (async () => {
                    const results = await Promise.all(undo.map((u) => runPatch(u.ids, u.patch)));
                    refresh(changed);
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
    [tasks, runPatch, refresh, qc],
  );

  // ── Pickers: one `CellEditor` at a time, anchored to its button on the bar.
  const [open, setOpen] = useState<TaskBulkField | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const editOf = (field: TaskBulkField): AnyCellEdit<readonly TaskBulkTask[]> => {
    const value = (rows: readonly TaskBulkTask[]) => commonValue(rows, field);
    switch (field) {
      case "estatus":
        return {
          kind: "select",
          value: (rows) => value(rows) as string | null,
          options: (rows) => (rows[0] ? taskCellOptions(rows[0], "estatus", catalogs) : []),
          commit: noCommit,
        };
      case "responsable":
        return {
          kind: "person",
          clearable: true,
          value: (rows) => value(rows) as string | null,
          options: (rows) => (rows[0] ? taskCellOptions(rows[0], "responsable", catalogs) : []),
          commit: noCommit,
        };
      case "apoyo":
        return {
          kind: "people",
          value: (rows) => value(rows) as string[],
          options: (rows) => (rows[0] ? taskCellOptions(rows[0], "responsable", catalogs) : []),
          commit: noCommit,
        };
      case "fase":
        return {
          kind: "select",
          clearable: true,
          value: (rows) => value(rows) as string | null,
          options: (rows) => bulkPhaseOptions(rows, phasesOf),
          commit: noCommit,
        };
      case "vence":
        return { kind: "date", quickPicks: true, clearable: true, value: (rows) => value(rows) as string | null, commit: noCommit };
      case "horas":
        return {
          kind: "number",
          min: HOURS_MIN,
          max: HOURS_MAX,
          step: HOURS_STEP,
          clearable: true,
          placeholder: formatHours(HOURS_FALLBACK),
          rangeError: HOURS_RANGE_ERROR,
          value: (rows) => value(rows) as string | null,
          commit: noCommit,
        };
    }
  };

  const actions: BulkBarAction[] =
    deletes?.canDelete
      ? [
          {
            id: "eliminar",
            label: DELETE_LABEL,
            destructive: true,
            disabled: tasks.length === 0,
            onSelect: () =>
              deletes.request(
                tasks.map((t): DeleteTaskTarget => ({ id: t.id, title: t.title, projectId: t.projectId })),
                { onDeleted: () => selection.clear() },
              ),
          },
        ]
      : [];

  return (
    <BulkActionBar count={selection.count} actions={actions} onClear={selection.clear}>
      {fields.map((field) => (
        <Button
          key={field}
          type="button"
          variant="ghost"
          size="sm"
          data-bulk-field={field}
          aria-haspopup="dialog"
          aria-expanded={open === field}
          disabled={tasks.length === 0}
          onClick={(event) => {
            setAnchor(event.currentTarget);
            setOpen((current) => (current === field ? null : field));
          }}
          className={BULK_BAR_BUTTON_CLASS}
        >
          {LABEL[field]}
          <ChevronDown aria-hidden="true" />
        </Button>
      ))}
      {open ? (
        <CellEditor<readonly TaskBulkTask[]>
          key={open}
          anchor={anchor}
          edit={editOf(open)}
          row={tasks}
          canEdit
          open
          label={LABEL[open]}
          onOpenChange={(next) => {
            if (!next) setOpen(null);
          }}
          onCommitted={(value) => void apply(open, value)}
        />
      ) : null}
    </BulkActionBar>
  );
}
