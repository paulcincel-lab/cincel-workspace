import type { QueryClient, QueryKey } from "@tanstack/react-query";

import {
  TASK_SUPPORT_COLUMN,
  taskSupportExclude,
  taskSupportIds,
  taskSupportLock,
  taskSupportOptions,
  taskWithSupport,
} from "@/components/tareas/task-cell-edits";
import { SUPPORT_COLUMN_LABEL, SUPPORT_IS_RESPONSIBLE } from "@/components/tareas/task-table-copy";
import { LOCK_REASON, type CellEdit, type CellOption, type PeopleCellEdit } from "@/components/widgets/editable-cell";
import {
  setTaskCustomStatusAction,
  setTaskStatusAction,
  setTaskSupportAction,
  updateTaskAction,
} from "@/lib/actions/tasks-actions";
import type { ActivitiesCapabilities } from "@/lib/auth/permissions";
import type { TaskRow } from "@/lib/my-space/my-tasks";
import { qk } from "@/lib/query/keys";
import {
  findMeTaskRow,
  patchMeTaskRows,
  patchMeTasksSummaryStatus,
  restoreMeTaskLists,
  restoreMeTasksSummaries,
  snapshotMeTaskLists,
  snapshotMeTasksSummaries,
} from "@/lib/query/options/mi-espacio";
import {
  BASE_STATUSES,
  BASE_STATUS_COLOR,
  customStatusBase,
  parseStatusValue,
  statusColorToken,
  statusColorVar,
  statusSelectItems,
  statusSelectValue,
} from "@/lib/tasks/status-options";
import type { StaffRef, TaskListRow, TaskPatch, TaskPriority, TaskStatusOption } from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";
import type { RecordColumn } from "@/lib/types/widgets";

/**
 * Mis tareas columns of Mi espacio Analítico (#1027). Tarea, Estatus, Vence
 * and Prioridad edit in place; Subtareas and Días de retraso are calculated.
 * Each commit patches the task in every loaded `me.tasksList` page first (a
 * task that closes leaves the open lists) and puts the cache back when the
 * server refuses. `CellCommitProvider` invalidates the `me.tasks` prefix on
 * settle; a status edit that opens, closes or blocks the task patches the
 * summary's counts first (`patchMeTasksSummaryStatus`). The other views of
 * the task are invalidated here on success.
 */
export type MiEspacioColumnsDeps = {
  qc: QueryClient;
  capabilities: Pick<ActivitiesCapabilities, "canCreateActivity" | "statusScope"> &
    Partial<Pick<ActivitiesCapabilities, "canChangeResponsible">>;
  /** People the Apoyo editor lists (#1038); empty while the catalog loads. */
  staff?: readonly StaffRef[];
  /** Custom statuses of the catalog (after the base ones in the Estatus list). */
  statuses: readonly TaskStatusOption[];
};

/** Query keys every Mis tareas column refreshes on settle. */
export const MI_ESPACIO_COMMIT_KEYS: QueryKey[] = [qk.me.tasks()];

export const PRIORITY_OPTIONS: CellOption[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

const PRIORITY_OF_LABEL: Record<string, TaskPriority> = { Alta: "alta", Media: "media", Baja: "baja" };

/** Estatus list: base statuses then the custom ones, each with its dot colour. */
export function statusOptions(statuses: readonly TaskStatusOption[]): CellOption[] {
  const custom = new Map(statuses.map((s) => [s.id, s]));
  return statusSelectItems([...statuses]).map((item) => {
    const parsed = parseStatusValue(item.value);
    if (parsed.kind === "base") return { ...item, color: statusColorVar(BASE_STATUS_COLOR[parsed.status]) };
    const status = custom.get(parsed.id);
    const token = status ? statusColorToken({ status: customStatusBase(status), customStatus: status }) : "chart-1";
    return { ...item, color: statusColorVar(token) };
  });
}

/** The cached row with the edit applied (a closed one leaves the open lists). */
type Patch = (task: TaskListRow) => TaskListRow;

/** Views outside Mi espacio that show the task. */
function otherViews(projectId: string): QueryKey[] {
  return [
    qk.tareas.all,
    qk.proyectos.tab(projectId, "tareas"),
    qk.proyectos.resumen(projectId),
    qk.proyectos.cronograma(projectId),
    qk.inicio(),
    qk.shell.badges(),
  ];
}

export function miEspacioTaskColumns({
  qc,
  capabilities,
  statuses,
  staff = [],
}: MiEspacioColumnsDeps): RecordColumn<TaskRow>[] {

  async function save(row: TaskRow, patch: Patch, run: () => Promise<ActionResult<unknown>>): Promise<ActionResult<unknown>> {
    const before = await snapshotMeTaskLists(qc);
    const summaries = await snapshotMeTasksSummaries(qc);
    // A status edit that opens, closes or blocks the task moves the counts at once.
    const cached = findMeTaskRow(qc, row.id);
    if (cached) patchMeTasksSummaryStatus(qc, cached, patch(cached));
    patchMeTaskRows(qc, row.id, patch);
    const result = await run();
    if (!result.ok) {
      restoreMeTaskLists(qc, before);
      restoreMeTasksSummaries(qc, summaries);
      return result;
    }
    for (const queryKey of otherViews(row.projectId)) void qc.invalidateQueries({ queryKey });
    return result;
  }

  function update(row: TaskRow, patch: TaskPatch): Promise<ActionResult<unknown>> {
    return save(row, (task) => ({ ...task, ...patch }), () => updateTaskAction(row.id, patch));
  }

  const writer = (): true | string => (capabilities.canCreateActivity ? true : LOCK_REASON.taskWriter);
  const statusWriter = (): true | string => (capabilities.statusScope === "none" ? LOCK_REASON.status : true);
  const customById = new Map(statuses.map((s) => [s.id, s]));
  const statusList = statusOptions(statuses);

  const title: CellEdit<TaskRow> = {
    kind: "text",
    required: true,
    value: (row) => row.title,
    commit: (row, v) => update(row, { title: (v ?? "").trim() }),
  };

  const estatus: CellEdit<TaskRow> = {
    kind: "select",
    options: () => statusList,
    value: (row) => statusSelectValue(row),
    commit: (row, v) => {
      const parsed = parseStatusValue(v ?? BASE_STATUSES[0]!);
      if (parsed.kind === "base") {
        const status = parsed.status;
        return save(
          row,
          (task) => ({ ...task, status, customStatusId: null, customStatus: null }),
          () => setTaskStatusAction(row.id, status),
        );
      }
      const custom = customById.get(parsed.id);
      return save(
        row,
        (task) => {
          if (!custom) return task;
          const { id, name, closes, countsAsCompleted } = custom;
          return { ...task, status: customStatusBase(custom), customStatusId: id, customStatus: { id, name, closes, countsAsCompleted } };
        },
        () => setTaskCustomStatusAction(row.id, parsed.id),
      );
    },
  };

  const vence: CellEdit<TaskRow> = {
    kind: "date",
    quickPicks: true,
    clearable: true,
    value: (row) => row.due,
    commit: (row, v) => update(row, { commitmentDate: v }),
  };

  // The task's priority is required (`alta` / `media` / `baja`), so the list has no "Sin prioridad".
  const prioridad: CellEdit<TaskRow> = {
    kind: "select",
    options: () => PRIORITY_OPTIONS,
    value: (row) => PRIORITY_OF_LABEL[row.prioridad] ?? null,
    commit: (row, v) => update(row, { priority: (v ?? "media") as TaskPriority }),
  };

  // Apoyo (#1038): the Responsable's rule; a task I leave stays until the list refreshes.
  const apoyo: PeopleCellEdit<TaskRow> = {
    kind: "people",
    value: (row) => taskSupportIds(row),
    options: () => taskSupportOptions(staff),
    exclude: (row) => taskSupportExclude(row),
    excludedLabel: SUPPORT_IS_RESPONSIBLE,
    commit: (row, ids) => save(row, (task) => taskWithSupport(task, ids, staff), () => setTaskSupportAction(row.id, ids)),
  };
  const supportWriter = (): true | string =>
    taskSupportLock({ caps: { canChangeResponsible: capabilities.canChangeResponsible === true } });

  return [
    { key: "title", label: "Tarea", fill: true, edit: title, canEdit: writer },
    { key: TASK_SUPPORT_COLUMN, label: SUPPORT_COLUMN_LABEL, width: 110, edit: apoyo, canEdit: supportWriter },
    { key: "estatus", label: "Estatus", width: 140, edit: estatus, canEdit: statusWriter },
    { key: "vence", label: "Vence", mono: true, width: 90, edit: vence, canEdit: writer },
    { key: "prioridad", label: "Prioridad", width: 90, edit: prioridad, canEdit: writer },
    { key: "subtareas", label: "Subtareas", align: "right", mono: true, width: 90 },
    { key: "retraso", label: "Días de retraso", align: "right", mono: true, width: 120 },
  ];
}
