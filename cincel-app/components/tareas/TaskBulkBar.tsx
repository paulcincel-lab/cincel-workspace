"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQueries, useQuery, type QueryKey } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import { BULK_BAR_BUTTON_CLASS, BulkActionBar, type BulkBarAction } from "@/components/widgets/BulkActionBar";
import { CellEditor } from "@/components/widgets/CellEditor";
import type { AnyCellEdit, CellValue } from "@/components/widgets/editable-cell";
import { DELETE_LABEL } from "@/components/widgets/table-rows";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { catalogTaskStatusesOptions } from "@/lib/query/options/catalog";
import { taskPhasesOptions } from "@/lib/query/options/tareas";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { StaffRef, TaskStatusOption, WorkflowPhaseRef } from "@/lib/types/core";

import {
  TASK_BULK_FIELDS,
  bulkPhaseOptions,
  commonValue,
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
import { useBulkTaskPatch } from "./use-bulk-task-patch";
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
  const user = useSessionStore(selectAuthenticatedUser);
  const caps = useMemo(() => resolveActivitiesCapabilities(user), [user]);
  const active = selection.count > 0;

  const tasks = useMemo(() => {
    if (!active) return NO_TASKS;
    return [...selection.selectedIds].map(taskOf).filter((t): t is TaskBulkTask => t !== undefined);
  }, [active, selection.selectedIds, taskOf]);

  // ── Catalogs: the custom statuses and the fases of the selected tasks' etapas, while the bar shows.
  const statuses = useQuery({ ...catalogTaskStatusesOptions(), enabled: active }).data ?? NO_STATUSES;
  const etapaIds = useMemo(() => [...new Set(tasks.flatMap((t) => (t.workflowId ? [t.workflowId] : [])))], [tasks]);
  const phaseData = useQueries({
    queries: etapaIds.map((id) => ({ ...taskPhasesOptions(id), enabled: active })),
    combine: (results) => results.map((r) => r.data),
  });
  const phasesOf = useCallback(
    (id: string): readonly WorkflowPhaseRef[] => phaseData[etapaIds.indexOf(id)] ?? NO_PHASES,
    [phaseData, etapaIds],
  );
  const catalogs = useMemo<TaskCellCatalogs>(
    () => ({ etapas: [], phasesOf: () => [], statuses, staff: [...staff], spacesOf: () => [] }),
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
  const { apply: applyPatch } = useBulkTaskPatch(invalidate);
  const apply = useCallback(
    (field: TaskBulkField, value: CellValue) => applyPatch(tasks, field, value),
    [applyPatch, tasks],
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
