"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";

import {
  PROJECT_TASKS_EMPTY,
  PROJECT_TASKS_ERROR,
  PROJECT_TASKS_SEE_ALL,
  projectOpenTasksFilters,
  sortByDueDate,
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
import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { renderAnaliticoTaskCell } from "@/components/widgets/analitico-task-cell";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { qk } from "@/lib/query/keys";
import { tareasListInfiniteOptions } from "@/lib/query/options/tareas";
import type { StaffRef, WorkflowRef } from "@/lib/types/core";

/**
 * The open tasks of one project, under its row in Proyectos · Analítico
 * (#1042). Same columns, cells and behaviour as the Tareas · Analítico table
 * (`ANALITICO_COLUMNS`, `useTaskCellEdits`, Apoyo, selection with
 * `TaskBulkBar`, delete) without the Tramo column: the project row already
 * says its tramo. Mounted on the row's first expand, it reads
 * `qk.tareas.list({ proyecto, mostrar: "abiertas" })` (completed tasks stay
 * out), sorted by due date, and ends with "Ver todas en el proyecto".
 */
export type ProjectAnaliticoTasksProps = {
  project: { id: string; name: string };
  /** Every tramo of the catalog (the Fase editor's lists). */
  tramos: WorkflowRef[];
  /** Responsable and Apoyo options. */
  staff: StaffRef[];
};

/** The project row's columns: the Tareas ones without Tramo. */
export const PROJECT_TASK_COLUMNS = ANALITICO_COLUMNS.filter((column) => column.key !== "tramo");

/** Keys a save here refreshes: the Tareas tables and the portfolio's counts. */
const COMMIT_KEYS = [...TAREAS_CELL_KEYS, qk.proyectos.list()];
const PAGE_KEYS = [qk.proyectos.list()];

const taskOfRow = (row: AnaliticoRow) => row.task;

export function ProjectAnaliticoTasks({ project, tramos, staff }: ProjectAnaliticoTasksProps): ReactNode {
  const router = useRouter();
  const filters = useMemo(() => projectOpenTasksFilters(project.id), [project.id]);
  const list = useInfiniteQuery(tareasListInfiniteOptions(filters));
  const pages = list.data?.pages;
  const today = localIsoDate();

  const deletes = useDeleteTasks({ invalidate: PAGE_KEYS });
  const isHidden = deletes.isHidden;
  const rows = useMemo(() => {
    if (!pages) return undefined;
    const tasks = pages.flatMap((page) => page.rows).filter((task) => !isHidden(task.id, task.parentTaskId));
    return sortByDueDate(tasks, (task) => task).map((task) => analiticoRow(task, today));
  }, [pages, isHidden, today]);
  const tasksById = useMemo(() => new Map((rows ?? []).map((row) => [row.id, row.task])), [rows]);
  const taskOf = useCallback((id: string) => tasksById.get(id), [tasksById]);

  const visibleIds = useMemo(() => (rows ?? []).map((row) => row.id), [rows]);
  const selection = useTaskSelection({ visibleIds });

  const cells = useTaskCellEdits<AnaliticoRow>({ taskOf: taskOfRow, tramos, staff });
  const columns = useMemo(() => cells.withEdits(PROJECT_TASK_COLUMNS), [cells]);

  const openTask = (id: string) => router.push(`/tareas?tarea=${encodeURIComponent(id)}`);
  const seeAll = `/proyectos/${encodeURIComponent(project.id)}/tareas`;
  const overdue = (rows ?? []).filter((row) => row.overdue).length;

  const groups: Group<AnaliticoRow>[] = [
    {
      id: `tareas-${project.id}`,
      label: project.name,
      metrics: [],
      headless: true,
      rows,
      loading: list.isPending || list.isFetchingNextPage,
      hasMore: Boolean(list.hasNextPage),
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
          {abiertasText(rows.length)}
          {list.hasNextPage ? "+" : ""} · <span className={overdue > 0 ? "text-destructive" : undefined}>{vencidasText(overdue)}</span>
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
