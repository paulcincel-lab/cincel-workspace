"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { FiltersBar, type FiltersBarProps } from "@/components/patterns/FiltersBar";
import { ErrorState } from "@/components/shell/ErrorState";
import { Button } from "@/components/ui/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { RecordTable } from "@/components/widgets/RecordTable";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import { PeopleStack } from "@/components/widgets/PeopleStack";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { TASK_SUPPORT_COLUMN } from "@/components/tareas/task-cell-edits";
import { SUPPORT_COLUMN_LABEL } from "@/components/tareas/task-table-copy";
import { TAREAS_CELL_KEYS, useTaskCellEdits } from "@/components/tareas/use-task-cell-edits";
import { catalogStaffOptions } from "@/lib/query/options/catalog";
import { tareasListInfiniteOptions } from "@/lib/query/options/tareas";
import { listItemOfRow } from "@/lib/tareas/page-data";
import { deleteTargetOf, useDeleteTasks } from "@/components/tareas/use-delete-tasks";
import { TaskBulkBar } from "@/components/tareas/TaskBulkBar";
import { useTaskSelection } from "@/components/tareas/use-task-selection";
import { HiddenCompletedLine, HideCompletedSwitch } from "@/components/widgets/HideCompletedSwitch";
import { StatusChip } from "@/components/widgets/StatusChip";
import { useHideCompletedTasks } from "@/components/tareas/use-hide-completed";
import { TASK_TABLE_SORT_KEYS, nextSort, tableSortOf } from "@/lib/tareas/sort";
import {
  PROJECT_TASK_ESTADO_LABEL,
  PROJECT_TASK_ESTADOS,
  UNASSIGNED_FILTER,
  UNASSIGNED_LABEL,
  buildGroupsTable,
  buildTasksTable,
  canAddToGroup,
  groupLoadedTasks,
  hiddenCompletedOf,
  isTaskLate,
  localDateKey,
  parseProjectTasksQuery,
  projectTareasKeysOf,
  projectTasksHref,
  validResponsable,
  type ProjectGroupRow,
  type ProjectTask,
  type ProjectTaskGroupSummary,
  type ProjectTaskRow,
  type ProjectTasksQuery,
  type ProyectoTareasSummary,
} from "@/lib/proyectos/project-tasks-by-fase";
import { proyectoTareasSummaryOptions } from "@/lib/query/options/proyectos";
import { qk } from "@/lib/query/keys";
import { useNewTaskUi } from "@/lib/stores/new-task-store";

export type ProjectTasksByFaseProps = {
  projectId: string;
  /** The server counts (`qk.proyectos.tareasSummary`): groups, chips, Responsable options. */
  summary: ProyectoTareasSummary;
  /** The loaded rows of the task list (`qk.tareas.list(f)` pages), already filtered by the server. */
  tasks: ProjectTask[];
  /** Every row matching the filters ("N de M mostradas"); default the loaded rows. */
  listTotal?: number;
  /** "Cargar más": more rows after the loaded ones. */
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** The first page is still loading. */
  loading?: boolean;
  /** "Ocultar completadas" (#1039), owned by the caller: it is part of the list filters. */
  hideCompleted?: boolean;
  onHideCompletedChange?: (hide: boolean) => void;
  /** `YYYY-MM-DD`; defaults to the viewer's local day. */
  today?: string;
};

const DEFAULT_QUERY: ProjectTasksQuery = { estado: "todas", responsable: null, q: "" };
const ALL_PEOPLE = "__todos__";
/** How long typing waits before the search reaches the URL. */
export const PROJECT_TASKS_SEARCH_DEBOUNCE_MS = 300;
const NO_STAFF: never[] = [];
const NO_ETAPAS: never[] = [];

/**
 * Writes the tab's filters to the URL with `history.replaceState`: the App
 * Router mirrors it into `useSearchParams`, which changes the list and
 * summary keys; no server render.
 */
function replaceFilters(projectId: string, query: ProjectTasksQuery): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", projectTasksHref(projectId, query));
}

/** The tab's URL filters (`?estado=&responsable=&q=`). */
function useProjectTasksQuery(): ProjectTasksQuery {
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  return useMemo(() => parseProjectTasksQuery(Object.fromEntries(new URLSearchParams(search))), [search]);
}

/**
 * The project Tareas tab (#1051): the counts from
 * `qk.proyectos.tareasSummary(id, { responsable, q })` and the rows from
 * `qk.tareas.list(f)`, 30 a page with "Cargar más", searched and filtered on
 * the server. The page prefetches both for the URL's filters.
 */
export function ProjectTareasTab({ projectId }: { projectId: string }) {
  const query = useProjectTasksQuery();
  const [hideCompleted, setHideCompleted] = useHideCompletedTasks();
  // The admin group's visibility comes with the summary; the first summary decides the list filters.
  const responsable = validResponsable(query.responsable);
  const summaryQuery = useQuery(proyectoTareasSummaryOptions(projectId, { responsable, q: query.q.trim() }));
  const summary = summaryQuery.data;
  const includeAdmin = summary?.includeAdmin ?? false;
  const keys = projectTareasKeysOf(projectId, query, { hideCompleted, includeAdmin });
  const list = useInfiniteQuery({ ...tareasListInfiniteOptions(keys.list), enabled: summary != null });
  const pages = list.data?.pages;
  const tasks = useMemo(() => (pages ?? []).flatMap((page) => page.rows.map(listItemOfRow)), [pages]);

  if (summaryQuery.isPending) return <LoadingSkeleton variant="table" rows={6} />;
  if (!summary) {
    if (summaryQuery.isError) {
      return <ErrorState title="No se pudieron cargar las tareas." onRetry={() => void summaryQuery.refetch()} />;
    }
    return <ErrorState title="No se pudieron cargar las tareas." description="El proyecto no existe o ya no tienes acceso." />;
  }
  return (
    <ProjectTasksByFase
      projectId={projectId}
      summary={summary}
      tasks={tasks}
      listTotal={pages?.at(-1)?.total ?? 0}
      loading={list.isPending}
      hasMore={Boolean(list.hasNextPage)}
      loadingMore={list.isFetchingNextPage}
      onLoadMore={() => void list.fetchNextPage()}
      hideCompleted={hideCompleted}
      onHideCompletedChange={setHideCompleted}
    />
  );
}

/**
 * Proyecto · Tareas (redesign FE §3.5, §4.6): the project's tasks grouped by
 * fase (by etapa when the project has no fase data) with progress per group,
 * the estado / responsable / search filters and "+ Agregar tarea" per group.
 * A composition of library widgets: the per-group summary and the grouped
 * task list are `RecordTable`s, which render Visual, Esencial and Analítico.
 *
 * The filters live in the URL (`estado`, `responsable`, `q`) and change it
 * with `history.replaceState` only; the caller turns them into the summary
 * and list keys, so the server searches and filters (#1051). Groups, chip
 * counts and "N de M" come from the summary, never from the loaded rows.
 * "Agregar tarea" opens the shell's one new-task dialog (`useNewTaskUi`).
 */
export function ProjectTasksByFase({
  projectId,
  summary,
  tasks,
  listTotal,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  loading = false,
  hideCompleted = false,
  onHideCompletedChange,
  today: todayProp,
}: ProjectTasksByFaseProps) {
  const summaryHeadingId = useId();
  const tasksHeadingId = useId();
  const today = useMemo(() => todayProp ?? localDateKey(new Date()), [todayProp]);

  const query = useProjectTasksQuery();
  // The input shows what is typed; the URL (and so the server search) follows after the debounce.
  const [draft, setDraft] = useState(() => query.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const currentQuery: ProjectTasksQuery = { ...query, q: draft };

  function setFilter(patch: Partial<ProjectTasksQuery>) {
    replaceFilters(projectId, { ...currentQuery, ...patch });
  }

  function handleSearch(value: string) {
    setDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      replaceFilters(projectId, { ...query, q: value.trim() });
    }, PROJECT_TASKS_SEARCH_DEBOUNCE_MS);
  }

  // Delete (#1041): deleted tasks leave the list right away; the summary refetches.
  const deletes = useDeleteTasks({ invalidate: [qk.proyectos.resumen(projectId), qk.proyectos.shell(projectId)] });
  const isHidden = deletes.isHidden;
  const rows = useMemo(() => tasks.filter((task) => !isHidden(task.id, task.parentTaskId)), [tasks, isHidden]);
  const counts = summary.counts;
  const total = summary.total;
  const shownCount = Math.max(0, (listTotal ?? rows.length) - (tasks.length - rows.length));
  const hiddenCompleted = hiddenCompletedOf(counts, query.estado, hideCompleted);

  const { mode, groups } = summary;
  const loadedGroups = useMemo(() => groupLoadedTasks(rows, summary), [rows, summary]);
  const groupsTable = useMemo(() => buildGroupsTable(groups, mode), [groups, mode]);

  // Apoyo (#1038) edits in place through the Tareas cell edits (they patch the `qk.tareas.list` pages).
  const [staffWanted, setStaffWanted] = useState(false);
  const staffQuery = useQuery({ ...catalogStaffOptions(), enabled: staffWanted });
  const staff = staffQuery.data ?? NO_STAFF;
  const tasksById = useMemo(() => new Map(rows.map((task) => [task.id, task])), [rows]);
  const taskOfRow = useCallback((row: ProjectTaskRow) => tasksById.get(row.id), [tasksById]);
  const cells = useTaskCellEdits<ProjectTaskRow>({ taskOf: taskOfRow, etapas: NO_ETAPAS, staff });
  const tasksTable = useMemo(() => {
    const table = buildTasksTable(loadedGroups, today);
    const support = cells.support();
    return {
      ...table,
      columns: table.columns.map((column) =>
        column.key === TASK_SUPPORT_COLUMN ? { ...column, edit: support.edit, canEdit: support.canEdit } : column,
      ),
    } as typeof table;
  }, [loadedGroups, today, cells]);
  const taskOfId = useCallback((id: string) => tasksById.get(id), [tasksById]);

  // Header sort (#1044): `?orden=`, on the server; the rows keep the order they come in.
  const tableSort = {
    sortable: tasksTable.columns.map((c) => c.key).filter((key) => key in TASK_TABLE_SORT_KEYS),
    sort: query.orden ? tableSortOf(query.orden) : null,
    onSortChange: (key: string) => {
      const column = TASK_TABLE_SORT_KEYS[key];
      if (column) setFilter({ orden: nextSort(query.orden ?? null, column) });
    },
  };

  // Row checkboxes and the bulk bar (#1040) on the task list: a filter change clears the selection.
  const visibleIds = useMemo(() => tasksTable.rows.map((row) => String(row.id)), [tasksTable.rows]);
  const selection = useTaskSelection({
    visibleIds,
    resetKey: JSON.stringify([query.estado, query.responsable, query.q, hideCompleted]),
  });

  const chips: NonNullable<FiltersBarProps["chips"]> = PROJECT_TASK_ESTADOS.map((estado) => ({
    key: estado,
    label: PROJECT_TASK_ESTADO_LABEL[estado],
    count: counts[estado],
    colorVar: estado === "vencidas" ? "var(--destructive)" : undefined,
    pressed: query.estado === estado,
    href: projectTasksHref(projectId, currentQuery, { estado }),
    onSelect: () => setFilter({ estado }),
  }));

  const openCreate = (group: ProjectTaskGroupSummary | null) =>
    useNewTaskUi
      .getState()
      .openNewTask({ projectId, ...(group?.etapa ? { etapaKey: group.etapa.key } : {}) }, "proyecto");

  const clearFilters = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
    setDraft("");
    replaceFilters(projectId, DEFAULT_QUERY);
  };

  const responsableSelect = (
    <Select
      key="responsable"
      value={query.responsable ?? ALL_PEOPLE}
      onValueChange={(value) =>
        setFilter({ responsable: value === ALL_PEOPLE || typeof value !== "string" ? null : value })
      }
    >
      <SelectTrigger aria-label="Responsable">
        <SelectValue placeholder="Responsable" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PEOPLE}>Todos los responsables</SelectItem>
        {summary.people.map((person) => (
          <SelectItem key={person.id} value={person.id}>
            {person.name}
          </SelectItem>
        ))}
        {summary.hasUnassigned ? <SelectItem value={UNASSIGNED_FILTER}>{UNASSIGNED_LABEL}</SelectItem> : null}
      </SelectContent>
    </Select>
  );

  const renderTaskCell = (columnKey: string, row: Record<string, unknown>): ReactNode | undefined => {
    const { task } = row as ProjectTaskRow;
    switch (columnKey) {
      case "estatus":
        return <StatusChip status={{ status: task.status, customStatus: task.customStatus }} size="sm" />;
      case "tarea":
        return (
          <Link
            href={`/tareas?tarea=${encodeURIComponent(task.id)}`}
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            {task.title}
          </Link>
        );
      case "estatusTexto":
      case "vence":
        return isTaskLate(task, today) ? <span className="text-destructive">{String(row[columnKey])}</span> : undefined;
      case "responsable":
        return task.manager ? undefined : <span className="text-muted-foreground">{UNASSIGNED_LABEL}</span>;
      case TASK_SUPPORT_COLUMN:
        return <PeopleStack people={task.support} label={SUPPORT_COLUMN_LABEL} />;
      default:
        return undefined;
    }
  };

  const renderGroupCell = (columnKey: string, row: Record<string, unknown>): ReactNode | undefined => {
    if (columnKey !== "agregar") return undefined;
    const { group } = row as ProjectGroupRow;
    if (!canAddToGroup(group)) return null;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => openCreate(group)}
        aria-label={`Agregar tarea a ${group.label}`}
      >
        <Plus aria-hidden="true" />
        Agregar tarea
      </Button>
    );
  };

  return (
    <div className="flex flex-col gap-6" data-slot="project-tasks-by-fase" data-group-mode={mode}>
      <FiltersBar
        chips={chips}
        selects={[responsableSelect]}
        search={{ value: draft, placeholder: `Buscar en ${total} tareas`, onChange: handleSearch }}
      />

      <section aria-labelledby={summaryHeadingId} className="flex flex-col gap-3">
        <h2 id={summaryHeadingId} className="text-base font-semibold text-foreground">
          {mode === "fase" ? "Avance por fase" : "Avance por etapa"}
        </h2>
        <RecordTable
          data={groupsTable}
          renderCell={renderGroupCell}
          emptyState={{
            title: "Este proyecto aún no tiene tareas",
            description: "Agrega la primera tarea del proyecto.",
            action: { label: "Agregar tarea", onClick: () => openCreate(null) },
          }}
        />
      </section>

      {total > 0 ? (
        <section aria-labelledby={tasksHeadingId} className="flex flex-col gap-3">
          <h2 id={tasksHeadingId} className="text-base font-semibold text-foreground">
            Tareas{" "}
            <span className="font-normal text-muted-foreground">
              · {shownCount} de {total} mostradas
            </span>
          </h2>
          <HideCompletedSwitch
            className="self-start"
            checked={hideCompleted}
            onCheckedChange={(hide) => onHideCompletedChange?.(hide)}
          />
          <CellCommitProvider queryKeys={[...TAREAS_CELL_KEYS, qk.proyectos.tab(projectId, "tareas")]}>
            <div
              className="contents"
              onPointerEnter={() => {
                setStaffWanted(true);
                cells.primeProps.onPointerEnter();
              }}
              onFocusCapture={() => {
                setStaffWanted(true);
                cells.primeProps.onFocusCapture();
              }}
            >
              {loading ? (
                <LoadingSkeleton variant="table" rows={6} />
              ) : (
                <RecordTable
                  data={tasksTable}
                  renderCell={renderTaskCell}
                  sort={tableSort}
                  rowSelection={{
                    selectable: true,
                    selectedIds: selection.selectedIds,
                    onSelectionChange: selection.onSelectionChange,
                    getRowLabel: (row) => (row as ProjectTaskRow).task.title,
                  }}
                  rowMenu={{
                    getRowLabel: (row) => (row as ProjectTaskRow).task.title,
                    // The title is already the task's link: the menu only adds Eliminar.
                    rowActions: (row) => deletes.rowActions(deleteTargetOf((row as ProjectTaskRow).task)),
                    onRowDelete: deletes.canDelete
                      ? (row) => deletes.request([deleteTargetOf((row as ProjectTaskRow).task)])
                      : undefined,
                  }}
                  emptyState={{
                    title: "No hay tareas con estos filtros",
                    action: { label: "Ver todas", onClick: clearFilters },
                  }}
                  onEndReached={onLoadMore}
                  hasMore={hasMore}
                  loadingMore={loadingMore}
                  remaining={Math.max(0, (listTotal ?? 0) - tasks.length)}
                />
              )}
            </div>
          </CellCommitProvider>
          <HiddenCompletedLine as="line" count={hiddenCompleted} onShow={() => onHideCompletedChange?.(false)} />
        </section>
      ) : null}
      {deletes.dialog}
      <TaskBulkBar
        selection={selection}
        taskOf={taskOfId}
        staff={staff}
        deletes={deletes}
        invalidate={[qk.proyectos.shell(projectId)]}
      />
    </div>
  );
}
