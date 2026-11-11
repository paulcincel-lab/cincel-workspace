"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";

import {
  PROJECT_TASKS_EMPTY,
  PROJECT_TASKS_ERROR,
  PROJECT_TASKS_SEE_ALL,
  projectOpenTasksFilters,
} from "@/components/proyectos/projects-portfolio-data";
import { ErrorState } from "@/components/shell/ErrorState";
import { TaskBulkBar } from "@/components/tareas/TaskBulkBar";
import {
  ANALITICO_COLUMNS,
  ANALITICO_DAYS_LATE_HEAT,
  abiertasText,
  analiticoRow,
  vencidasText,
  type AnaliticoRow,
} from "@/components/tareas/tareas-analitico";
import { localIsoDate } from "@/components/tareas/tablero-table";
import { deleteTargetOf, useDeleteTasks } from "@/components/tareas/use-delete-tasks";
import { TAREAS_CELL_KEYS, useTaskCellEdits } from "@/components/tareas/use-task-cell-edits";
import { useTaskSelection } from "@/components/tareas/use-task-selection";
import { useSubtaskRows } from "@/components/tareas/use-subtask-rows";
import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { renderAnaliticoTaskCell } from "@/components/widgets/analitico-task-cell";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { qk } from "@/lib/query/keys";
import { tareasListInfiniteOptions } from "@/lib/query/options/tareas";
import { TASK_TABLE_SORT_KEYS, nextSort, tableSortOf, type TaskSort } from "@/lib/tareas/sort";
import type { StaffRef, TaskListRow, WorkflowRef } from "@/lib/types/core";

/**
 * The open tasks of one project, under its row in Proyectos · Analítico
 * (#1042). Same columns, cells and behaviour as the Tareas · Analítico table
 * (`ANALITICO_COLUMNS`, `useTaskCellEdits`, Apoyo, selection with
 * `TaskBulkBar`, delete) without the Tramo column: the project row already
 * says its tramo. Mounted on the row's first expand, it reads
 * `qk.tareas.list({ proyecto, mostrar: "abiertas", orderBy: "vence" })`
 * (completed tasks stay out), sorted by due date on the server, 30 rows a
 * page with "Cargar más (n restantes)", and ends with "Ver todas en el
 * proyecto". The counts come from the page total and the portfolio row,
 * never from the loaded rows (#1051).
 */
export type ProjectAnaliticoTasksProps = {
  project: { id: string; name: string };
  /** Every tramo of the catalog (the Fase editor's lists). */
  tramos: WorkflowRef[];
  /** Responsable and Apoyo options. */
  staff: StaffRef[];
  /** The project's overdue open tasks, from the portfolio row (the loaded rows may be only the first page). */
  overdue?: number;
};

/** The project row's columns: the Tareas ones without Tramo. */
export const PROJECT_TASK_COLUMNS = ANALITICO_COLUMNS.filter((column) => column.key !== "tramo");

/** Keys a save here refreshes: the Tareas tables and the portfolio's counts. */
const COMMIT_KEYS = [...TAREAS_CELL_KEYS, qk.proyectos.list()];
const PAGE_KEYS = [qk.proyectos.list()];

const taskOfRow = (row: AnaliticoRow) => row.task;

/** The project rows' sort when the header names none: by due date (`projectOpenTasksFilters`). */
const PROJECT_TASKS_SORT: TaskSort = { orderBy: "vence", orderDir: "asc" };
/** Every column with a server sort (#1044). */
const PROJECT_TASKS_SORTABLE = PROJECT_TASK_COLUMNS.map((c) => c.key).filter((key) => key in TASK_TABLE_SORT_KEYS);

export function ProjectAnaliticoTasks({ project, tramos, staff, overdue: overdueProp }: ProjectAnaliticoTasksProps): ReactNode {
  const router = useRouter();
  // Header sort (#1044), on the server. The default keeps the `projectOpenTasksFilters` key
  // that "Expandir todo" seeds.
  const [sort, setSort] = useState<TaskSort>(PROJECT_TASKS_SORT);
  const filters = useMemo(() => {
    const base = projectOpenTasksFilters(project.id);
    const isDefault = sort.orderBy === PROJECT_TASKS_SORT.orderBy && sort.orderDir === PROJECT_TASKS_SORT.orderDir;
    if (isDefault) return base;
    return { ...base, orderBy: sort.orderBy, ...(sort.orderDir === "desc" ? { orderDir: "desc" as const } : {}) };
  }, [project.id, sort]);
  const tableSort = useMemo(() => tableSortOf(sort), [sort]);
  const onSortChange = useCallback(
    (key: string) => {
      const column = TASK_TABLE_SORT_KEYS[key];
      if (column) setSort((current) => nextSort(current, column) ?? PROJECT_TASKS_SORT);
    },
    [],
  );
  const list = useInfiniteQuery(tareasListInfiniteOptions(filters));
  const pages = list.data?.pages;
  const today = localIsoDate();

  const deletes = useDeleteTasks({ invalidate: PAGE_KEYS });
  const isHidden = deletes.isHidden;
  const rows = useMemo(() => {
    if (!pages) return undefined;
    // Already in the server order: sorting here would reorder the loaded rows when the next page lands.
    return pages
      .flatMap((page) => page.rows)
      .filter((task) => !isHidden(task.id, task.parentTaskId))
      .map((task) => analiticoRow(task, today));
  }, [pages, isHidden, today]);
  const loadedCount = useMemo(() => (pages ?? []).reduce((sum, page) => sum + page.rows.length, 0), [pages]);
  const total = pages?.at(-1)?.total ?? 0;
  // Subtasks (#1048): a collapsible block of nested rows under each parent row.
  const parents = useMemo(() => (rows ?? []).map((row) => row.task), [rows]);
  const toRow = useCallback((task: TaskListRow) => analiticoRow(task, today), [today]);
  const subtasks = useSubtaskRows<AnaliticoRow>({ parents, toRow, taskOf: taskOfRow, isHidden });
  const shown = useMemo(() => [...(rows ?? []), ...subtasks.shownRows], [rows, subtasks.shownRows]);
  const tasksById = useMemo(() => new Map(shown.map((row) => [row.id, row.task])), [shown]);
  const taskOf = useCallback((id: string) => tasksById.get(id), [tasksById]);

  const visibleIds = useMemo(() => shown.map((row) => row.id), [shown]);
  const selection = useTaskSelection({ visibleIds });

  const cells = useTaskCellEdits<AnaliticoRow>({ taskOf: taskOfRow, tramos, staff });
  const columns = useMemo(() => cells.withEdits(PROJECT_TASK_COLUMNS), [cells]);

  const openTask = (id: string) => router.push(`/tareas?tarea=${encodeURIComponent(id)}`);
  const seeAll = `/proyectos/${encodeURIComponent(project.id)}/tareas`;
  const overdue = overdueProp ?? (rows ?? []).filter((row) => row.overdue).length;
  const openCount = Math.max(0, total - (loadedCount - (rows?.length ?? 0)));

  const groups: Group<AnaliticoRow>[] = [
    {
      id: `tareas-${project.id}`,
      label: project.name,
      metrics: [],
      headless: true,
      rows,
      loading: list.isPending || list.isFetchingNextPage,
      hasMore: Boolean(list.hasNextPage),
      remaining: Math.max(0, total - loadedCount),
    },
  ];

  let body: ReactNode;
  if (list.isError && !rows) {
    body = <ErrorState title={PROJECT_TASKS_ERROR} onRetry={() => void list.refetch()} />;
  } else if (rows && rows.length === 0 && !list.hasNextPage) {
    body = <p className="px-1 py-2 text-[12.5px] text-muted-foreground">{PROJECT_TASKS_EMPTY}</p>;
  } else {
    body = (
      <CellCommitProvider queryKeys={COMMIT_KEYS}>
        <GroupedTable<AnaliticoRow>
          label={`Tareas abiertas de ${project.name}`}
          layout="table"
          toggleAll={false}
          columns={columns}
          groups={groups}
          heat={[ANALITICO_DAYS_LATE_HEAT]}
          getRowId={(row) => row.id}
          sortable={PROJECT_TASKS_SORTABLE}
          sort={tableSort}
          onSortChange={onSortChange}
          rowDetail={subtasks.rowDetail}
          renderCell={renderAnaliticoTaskCell}
          rowHref={(row) => `/tareas?tarea=${encodeURIComponent(row.id)}`}
          isRowMuted={(row) => row.closed}
          getRowLabel={(row) => row.tarea}
          selectable
          selectedIds={selection.selectedIds}
          onSelectionChange={selection.onSelectionChange}
          rowActions={(row) => deletes.rowActions(deleteTargetOf(row.task), () => openTask(row.id))}
          onRowDelete={deletes.canDelete ? (row) => deletes.request([deleteTargetOf(row.task)]) : undefined}
          onLoadMore={() => void list.fetchNextPage()}
        />
      </CellCommitProvider>
    );
  }

  return (
    <div data-slot="project-tasks" data-project={project.id} className="flex min-w-0 flex-col gap-2 py-3 pr-3 pl-10" {...cells.primeProps}>
      {rows && rows.length > 0 ? (
        <p className="font-mono text-xs text-muted-foreground">
          {abiertasText(openCount)} · <span className={overdue > 0 ? "text-destructive" : undefined}>{vencidasText(overdue)}</span>
        </p>
      ) : null}
      {body}
      <TaskBulkBar selection={selection} taskOf={taskOf} staff={staff} deletes={deletes} invalidate={PAGE_KEYS} />
      <Link href={seeAll} className="self-start text-[12.5px] font-medium text-foreground underline underline-offset-[3px] hover:text-primary">
        {PROJECT_TASKS_SEE_ALL}
      </Link>
      {deletes.dialog}
    </div>
  );
}
