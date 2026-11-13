"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { ErrorState } from "@/components/shell/ErrorState";
import { Button } from "@/components/ui/shadcn/button";
import { Switch } from "@/components/ui/shadcn/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { FilterCard, type FilterGroup } from "@/components/widgets/FilterCard";
import { renderAnaliticoTaskCell } from "@/components/widgets/analitico-task-cell";
import { HiddenCompletedLine, HideCompletedSwitch } from "@/components/widgets/HideCompletedSwitch";
import { GroupedTable, type Group, type GroupAnchor, type RowDetail } from "@/components/widgets/GroupedTable";
import { IncludeSupportSwitch } from "@/components/widgets/IncludeSupportSwitch";
import { KpiStrip } from "@/components/widgets/KpiStrip";
import { ProjectFilter } from "@/components/widgets/ProjectFilter";
import { QuickAddRow, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { tareasListInfiniteOptions, tareasSummaryOptions } from "@/lib/query/options/tareas";
import { selectAnaliticoCollapsed, useTareasUi } from "@/lib/stores/tareas-ui-store";
import type { TareasFacets, TareasStaffOption } from "@/lib/tareas/page-data";
import { useHideCompletedPreference } from "@/lib/stores/appearance-store";
import {
  effectiveMostrar,
  hiddenCompletedCount,
  hideCompletedPatch,
  isHidingCompleted,
  proyectosPatch,
  responsableFilter,
  selectedProyectos,
  type TareasMostrar,
  type TareasQuery,
} from "@/lib/tareas/query";
import { EMPTY_TAREAS_SUMMARY, summaryEtapaKey, tareasGroupFilters, type TareasSummary } from "@/lib/tareas/summary";
import { etapaColorVar } from "@/lib/etapas/compat";
import { TASK_TABLE_SORT_KEYS, describeSort, nextSort, tableSortOf } from "@/lib/tareas/sort";
import type { TareasListFilters } from "@/lib/query/keys";
import type { TaskListRow, WorkflowRef } from "@/lib/types/core";

import { useQuickAddCreate } from "./quick-add-create";
import {
  ANALITICO_ANCHORS_CAPTION,
  ANALITICO_COLUMNS,
  ANALITICO_COLUMNS_WITH_HOURS,
  ANALITICO_DAYS_LATE_HEAT,
  ANALITICO_DESCRIPTION,
  ANALITICO_EMPTY_LATE_TITLE,
  ANALITICO_EMPTY_TITLE,
  ANALITICO_TABLE_LABEL,
  analiticoKpis,
  analiticoRow,
  analiticoTotals,
  expandAnnouncement,
  hiddenProjectsNote,
  projectCaption,
  projectFooter,
  projectGroupId,
  projectMetrics,
  etapaCaption,
  etapaGroupId,
  etapaMetrics,
  type AnaliticoRow,
} from "./tareas-analitico";
import { localIsoDate } from "./tablero-table";
import { TAREAS_CELL_KEYS, useTaskCellEdits } from "./use-task-cell-edits";
import { deleteTargetOf, useDeleteTasks } from "./use-delete-tasks";
import { TaskBulkBar } from "./TaskBulkBar";
import { SHOW_HOURS_COLUMN_LABEL } from "./task-table-copy";
import { useTaskSelection } from "./use-task-selection";
import { SUBTASKS_COLLAPSE_ALL, SUBTASKS_EXPAND_ALL, subtaskQuickAddCopy, subtasksAnnouncement, useSubtaskRows } from "./use-subtask-rows";
import { useTareasFilters, useTareasPageReady, useTareasSort } from "./use-tareas-page";

export const ANALITICO_SEARCH_LABEL = "Buscar tareas";
export const ANALITICO_RESPONSABLE_LABEL = "Responsable";

const RESPONSABLE_TODOS = "todos";
const RESPONSABLE_YO = "yo";
const ETAPA_TODOS = "todos";

const MOSTRAR_LABEL: Record<TareasMostrar, string> = { todas: "Todas", abiertas: "Abiertas", en_retraso: "En retraso" };
const MOSTRAR_ORDER: readonly TareasMostrar[] = ["todas", "abiertas", "en_retraso"];

export type TareasAnaliticoProps = {
  query: TareasQuery;
  facets: TareasFacets;
  etapas: WorkflowRef[];
  /** Responsable options: the page's staff (`{id,name}`). */
  staff: TareasStaffOption[];
  /** "Nueva tarea" (the Estilo switch is added by `PageHeader`). */
  actions: ReactNode;
  /** The search box text (debounced into `?q=` by the page). */
  search: string;
  onSearch(value: string): void;
  /** Writes a filter patch to the URL (no server render). */
  onQuery(patch: Partial<TareasQuery>): void;
  /** "No hay tareas con estos filtros" with "Quitar filtros". */
  empty: EmptyStateProps;
  /** Quick-add rows only for viewers who can create tasks. */
  canCreate: boolean;
  /** Project Flow's start slot under the header (only with one etapa filter). */
  startSlot?: ReactNode;
};

/** What one etapa group's rows query reports to the page. */
type GroupRowsState = { rows: TaskListRow[] | undefined; loading: boolean; error: boolean; hasMore: boolean };
type GroupRowsActions = { more(): void };

/**
 * One etapa group's rows (`useInfiniteQuery(tareas.list(groupFilters))`,
 * "retraso" order, 50 per page; the first groups come seeded by the page
 * bundle). Renders nothing: it reports the rows to the page, which hands them
 * to `GroupedTable`. Mounted only while its group is open.
 */
function GroupRowsLoader({
  id,
  filters,
  onState,
  actions,
}: {
  id: string;
  filters: TareasListFilters;
  onState(id: string, state: GroupRowsState): void;
  actions: RefObject<Map<string, GroupRowsActions>>;
}) {
  const list = useInfiniteQuery(tareasListInfiniteOptions(filters));
  const pages = list.data?.pages;
  const rows = useMemo(() => pages?.flatMap((p) => p.rows), [pages]);
  const loading = list.isPending || list.isFetchingNextPage;
  const error = list.isError && !rows;
  const hasMore = Boolean(list.hasNextPage);
  const { fetchNextPage } = list;

  // Registers "Cargar más" only; nothing loads here. A retry refetches the group's key from the page.
  useEffect(() => {
    const map = actions.current;
    map.set(id, { more: () => void fetchNextPage() });
    return () => {
      map.delete(id);
    };
  }, [id, fetchNextPage, actions]);

  useEffect(() => {
    onState(id, { rows, loading, error, hasMore });
  }, [id, rows, loading, error, hasMore, onState]);

  return null;
}

const taskOfRow = (row: AnaliticoRow) => row.task;

/** Every Analítico column with a server sort (all but Apoyo). */
const ANALITICO_SORTABLE = ANALITICO_COLUMNS.map((c) => c.key).filter((key) => key in TASK_TABLE_SORT_KEYS);

/** Cells of a full-width row: the data columns, the checkbox column (#1040) and the `⋯` column (#1041). */
const ANALITICO_SPAN = ANALITICO_COLUMNS.length + 2;

/** The rows of every etapa group, in table order. */
function analiticoRows(groups: Group<AnaliticoRow>[]): AnaliticoRow[] {
  return groups.flatMap((group) => [...(group.rows ?? []), ...analiticoRows(group.children ?? [])]);
}

/** The rows in table order with each open parent's subtask rows after it (#1048). */
function withOpenSubtasks(rows: AnaliticoRow[], detail: RowDetail<AnaliticoRow>): AnaliticoRow[] {
  return rows.flatMap((row) => [row, ...((detail.hasDetail?.(row) ?? true) && detail.isOpen(row) ? (detail.rows?.(row) ?? []) : [])]);
}

/** An etapa group's last rows: "n completadas ocultas · Mostrar", then its quick-add (or error) row. */
function withHiddenLine(hiddenLine: ReactNode, quickAdd: ReactNode): ReactNode {
  if (!hiddenLine) return quickAdd;
  return (
    <>
      {hiddenLine}
      {quickAdd}
    </>
  );
}

function sameState(a: GroupRowsState | undefined, b: GroupRowsState): boolean {
  return !!a && a.rows === b.rows && a.loading === b.loading && a.error === b.error && a.hasMore === b.hasMore;
}

/**
 * Tareas · Analítico (frames `Main`, `Analitico-Vencidas`, Estilos #988):
 * every task in tables grouped project → etapa, ordered by delay. Header,
 * `FilterCard` (Mostrar, Etapa, Responsable, search; synced with the URL),
 * `KpiStrip`, then `GroupedTable` with the "Ir a" row, one section per
 * project (overdue desc, then name) and one group per etapa, each with its
 * own rows query, a quick-add row (not in En retraso) and a footer. Every
 * count comes from `tareas.summary(f)`. En retraso hides projects and etapas
 * without overdue tasks and names the hidden projects. Every group starts
 * expanded; what the viewer collapses is remembered in `useTareasUi`.
 */
export function TareasAnalitico({
  query,
  facets,
  etapas,
  staff,
  actions,
  search,
  onSearch,
  onQuery,
  empty,
  canCreate,
  startSlot,
}: TareasAnaliticoProps) {
  const f = useTareasFilters(query);
  // ── Header sort (#1044): `?orden=`, applied on the server inside every etapa group.
  const sort = useTareasSort(query);
  const tableSort = useMemo(() => tableSortOf(sort), [sort]);
  const onSortChange = useCallback(
    (key: string) => {
      const column = TASK_TABLE_SORT_KEYS[key];
      if (column) onQuery({ orden: nextSort(sort, column) });
    },
    [onQuery, sort],
  );
  const description = sort ? `Por proyecto y etapa, ${describeSort(sort.orderBy, sort.orderDir)}.` : ANALITICO_DESCRIPTION;
  const ready = useTareasPageReady(query);
  const summaryQuery = useQuery({ ...tareasSummaryOptions(f), enabled: ready });
  const summary: TareasSummary = summaryQuery.data ?? EMPTY_TAREAS_SUMMARY;
  const summaryLoading = !summaryQuery.data && (summaryQuery.isPending || !ready);
  const mostrar = query.mostrar;
  const late = mostrar === "en_retraso";
  const today = localIsoDate();

  // ── "Ocultar completadas" (#1039): on with the switch or a Mostrar that implies it; the
  // summary and rows then filter as Abiertas, and each etapa group says how many it hides.
  const hiding = isHidingCompleted(query);
  const countsHidden = effectiveMostrar(query) === "abiertas";
  const [, setHidePreference] = useHideCompletedPreference();
  const onHideCompleted = useCallback(
    (hide: boolean) => {
      setHidePreference(hide);
      onQuery(hideCompletedPatch(hide, query));
    },
    [setHidePreference, onQuery, query],
  );

  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Expansion: every group open but the collapsed ones (kept per user in the store).
  const collapsed = useTareasUi(selectAnaliticoCollapsed);
  const setCollapsed = useTareasUi((s) => s.setAnaliticoCollapsed);
  const allIds = useMemo(
    () =>
      summary.projects.flatMap((p) => [
        projectGroupId(p.project.id),
        ...p.etapas.map((t) => etapaGroupId(p.project.id, t.etapa.id)),
      ]),
    [summary.projects],
  );
  const collapsedSet = useMemo(() => new Set(collapsed), [collapsed]);
  const expanded = useMemo(() => allIds.filter((id) => !collapsedSet.has(id)), [allIds, collapsedSet]);
  const [announcement, setAnnouncement] = useState("");
  const onExpandedChange = useCallback(
    (ids: string[]) => {
      const open = new Set(ids);
      const opened = allIds.filter((id) => open.has(id) && collapsedSet.has(id)).length;
      const closed = allIds.filter((id) => !open.has(id) && !collapsedSet.has(id)).length;
      // Groups outside the current summary keep their remembered state.
      const others = collapsed.filter((id) => !allIds.includes(id));
      setCollapsed([...others, ...allIds.filter((id) => !open.has(id))]);
      // "Expandir todo" / "Contraer todo" move several groups at once: say how many.
      if (opened > 1) setAnnouncement(expandAnnouncement(true, opened));
      else if (closed > 1) setAnnouncement(expandAnnouncement(false, closed));
    },
    [allIds, collapsed, collapsedSet, setCollapsed],
  );

  // ── Rows per open etapa group.
  const [groupRows, setGroupRows] = useState<Record<string, GroupRowsState>>({});
  const rowActions = useRef(new Map<string, GroupRowsActions>());
  const onGroupState = useCallback((id: string, state: GroupRowsState) => {
    setGroupRows((prev) => (sameState(prev[id], state) ? prev : { ...prev, [id]: state }));
  }, []);
  const openGroups = useMemo(
    () =>
      summary.projects.flatMap((p) =>
        collapsedSet.has(projectGroupId(p.project.id))
          ? []
          : p.etapas
              .filter((t) => !collapsedSet.has(etapaGroupId(p.project.id, t.etapa.id)))
              .map((t) => ({ id: etapaGroupId(p.project.id, t.etapa.id), filters: tareasGroupFilters(f, p.project.id, t.etapa.key, sort) })),
      ),
    [summary.projects, collapsedSet, f, sort],
  );
  const queryClient = useQueryClient();
  const retryGroup = useCallback(
    (id: string) => {
      const group = openGroups.find((g) => g.id === id);
      if (group) void queryClient.refetchQueries({ queryKey: tareasListInfiniteOptions(group.filters).queryKey, exact: true });
    },
    [openGroups, queryClient],
  );

  // ── Quick-add: rows it created enter with `row-new` and a "Nueva" tag.
  const quickAdd = useQuickAddCreate();
  const createRef = useRef(quickAdd.create);
  useEffect(() => {
    createRef.current = quickAdd.create;
  });
  const [created, setCreated] = useState<ReadonlySet<string>>(() => new Set());
  const onCreate = useCallback(async (draft: QuickAddDraft) => {
    const result = await createRef.current(draft);
    setCreated((prev) => new Set(prev).add(result.id));
    return result;
  }, []);

  // ── Delete (#1041): rows (and their subtasks) leave right away; counts follow the refetch.
  const deletes = useDeleteTasks();
  const isHidden = deletes.isHidden;

  const groups = useMemo<Group<AnaliticoRow>[]>(
    () =>
      summary.projects.map((p) => ({
        id: projectGroupId(p.project.id),
        label: p.project.name,
        caption: projectCaption(summary, p, mostrar),
        metrics: projectMetrics(p),
        footer: projectFooter(p, mostrar),
        children: p.etapas.map((t) => {
          const id = etapaGroupId(p.project.id, t.etapa.id);
          const state = groupRows[id];
          const etapaRef = t.etapa.key ? etapas.find((w) => w.id === t.etapa.id) : undefined;
          const failed = state?.error === true;
          const allInEtapa =
            summary.unfiltered.projectList?.find((u) => u.id === p.project.id)?.byEtapa[summaryEtapaKey(t.etapa.id)] ?? t.total;
          const hidden = countsHidden && !failed ? hiddenCompletedCount(allInEtapa, t.total) : 0;
          const hiddenLine =
            hidden > 0 ? (
              <HiddenCompletedLine count={hidden} colSpan={ANALITICO_SPAN} onShow={() => onHideCompleted(false)} />
            ) : null;
          return {
            id,
            label: t.etapa.name,
            color: t.etapa.key ? etapaColorVar(t.etapa.key, etapaRef?.sortOrder ?? t.etapa.sortOrder) : undefined,
            caption: etapaCaption(summary, p.project.id, t, mostrar),
            metrics: etapaMetrics(t, mostrar),
            rows: failed
              ? []
              : state?.rows?.filter((row) => !isHidden(row.id, row.parentTaskId)).map((row) => analiticoRow(row, today)),
            loading: !failed && (state?.loading ?? false),
            hasMore: state?.hasMore ?? false,
            // "Cargar más (n restantes)" (#1051): the summary counts the group, the rows are what loaded.
            remaining: state?.rows ? Math.max(0, t.total - state.rows.length) : undefined,
            quickAdd: withHiddenLine(hiddenLine, failed ? (
              <tr>
                <td colSpan={ANALITICO_SPAN} className="border-b border-border px-3 py-2">
                  <ErrorState title="No se pudo cargar" onRetry={() => retryGroup(id)} />
                </td>
              </tr>
            ) : canCreate && !late ? (
              <QuickAddRow
                variant="row"
                colSpan={ANALITICO_SPAN}
                context={{
                  label: `Nueva tarea en ${t.etapa.name}`,
                  projectId: p.project.id,
                  etapaId: t.etapa.id,
                  placeholder: `Nueva tarea en ${t.etapa.name}…`,
                }}
                onCreate={onCreate}
              />
            ) : undefined),
          };
        }),
      })),
    [summary, mostrar, groupRows, etapas, today, canCreate, late, onCreate, countsHidden, onHideCompleted, isHidden, retryGroup],
  );

  // ── Subtasks (#1048): a collapsible block of nested rows under each parent, "+ Subtarea…" last.
  const loadedParents = useMemo(
    () =>
      openGroups.flatMap((g) => (groupRows[g.id]?.rows ?? []).filter((row) => !isHidden(row.id, row.parentTaskId))),
    [openGroups, groupRows, isHidden],
  );
  const toAnaliticoRow = useCallback((task: TaskListRow) => analiticoRow(task, today), [today]);
  const subtaskAdd = useCallback(
    (parent: TaskListRow) =>
      canCreate && !late ? (
        <QuickAddRow
          variant="row"
          colSpan={ANALITICO_SPAN}
          context={{ ...subtaskQuickAddCopy(parent.title), projectId: parent.projectId, etapaId: parent.workflowId, parentTaskId: parent.id }}
          onCreate={onCreate}
        />
      ) : null,
    [canCreate, late, onCreate],
  );
  const subtasks = useSubtaskRows<AnaliticoRow>({ parents: loadedParents, toRow: toAnaliticoRow, taskOf: taskOfRow, isHidden, after: subtaskAdd });
  const { toggleAll: toggleAllSubtasks, allOpen: allSubtasksOpen } = subtasks;
  const onToggleAllSubtasks = useCallback(async () => {
    const opening = !allSubtasksOpen;
    const moved = await toggleAllSubtasks();
    if (moved > 0) setAnnouncement(subtasksAnnouncement(opening, moved));
  }, [allSubtasksOpen, toggleAllSubtasks]);

  // ── Row checkboxes and the bulk bar (#1040): a filter change clears the selection.
  const shownRows = useMemo(() => withOpenSubtasks(analiticoRows(groups), subtasks.rowDetail), [groups, subtasks.rowDetail]);
  const visibleIds = useMemo(() => shownRows.map((row) => row.id), [shownRows]);
  const selection = useTaskSelection({ visibleIds, resetKey: JSON.stringify(f) });
  const taskOfId = useMemo(() => {
    const byId = new Map(shownRows.map((row) => [row.id, row.task]));
    return (id: string) => byId.get(id);
  }, [shownRows]);

  const anchors = useMemo<GroupAnchor[]>(
    () =>
      summary.projects.map((p) => ({
        groupId: projectGroupId(p.project.id),
        label: p.project.name,
        count: p.overdue,
        tone: "destructive",
      })),
    [summary.projects],
  );

  // ── `?tarea=<id>` opens the task sheet over the table (shallow: the table under it stays as it is).
  const taskHref = useCallback(
    (taskId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tarea", taskId);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams],
  );
  const rowHref = useCallback((row: AnaliticoRow) => taskHref(row.id), [taskHref]);
  const openTask = useCallback((taskId: string) => window.history.pushState(null, "", taskHref(taskId)), [taskHref]);

  // Clicking a cell edits it; ⌘/Ctrl-click on a row opens the task (the title link and its
  // open icon, added by `GroupedTable` from `rowHref`, keep their own ⌘/Ctrl-click: new tab).
  const onRowsClickCapture = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const target = event.target as HTMLElement;
      if (target.closest("a")) return;
      const id = target.closest<HTMLElement>('[data-slot="leaf-row"]')?.dataset.rowId;
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      openTask(id);
    },
    [openTask],
  );

  // ── Editable cells (#1025): every task column but Subtareas and Días de retraso.
  const cells = useTaskCellEdits<AnaliticoRow>({ taskOf: taskOfRow, etapas, staff });
  // Horas estimadas (#1084): an optional column, hidden here until the switch is on.
  const [showHours, setShowHours] = useState(false);
  const hoursSwitchId = useId();
  const columns = useMemo(
    () => cells.withEdits(showHours ? ANALITICO_COLUMNS_WITH_HOURS : ANALITICO_COLUMNS),
    [cells, showHours],
  );


  // ── Filters.
  const filterGroups = useMemo<FilterGroup[]>(
    () => [
      {
        id: "mostrar",
        label: "Mostrar",
        value: mostrar,
        options: MOSTRAR_ORDER.map((value) => ({
          value,
          label: MOSTRAR_LABEL[value],
          ...(facets.mostrar ? { count: facets.mostrar[value] } : {}),
          ...(value === "en_retraso" ? { tone: "destructive" as const } : {}),
        })),
      },
      {
        id: "etapa",
        label: "Etapa",
        value: query.etapa ?? ETAPA_TODOS,
        options: [
          { value: ETAPA_TODOS, label: "Todos" },
          ...etapas.map((t) => ({ value: t.key, label: t.name, color: etapaColorVar(t.key, t.sortOrder) })),
        ],
      },
    ],
    [mostrar, facets.mostrar, query.etapa, etapas],
  );

  const onFilterChange = useCallback(
    (groupId: string, value: string) => {
      if (groupId === "mostrar") onQuery({ mostrar: value as TareasMostrar });
      else if (groupId === "etapa") onQuery({ etapa: value === ETAPA_TODOS ? null : value });
    },
    [onQuery],
  );

  const responsableItems = useMemo(
    () => [
      { value: RESPONSABLE_TODOS, label: "Todos" },
      { value: RESPONSABLE_YO, label: "Yo" },
      ...staff.map((s) => ({ value: s.id, label: s.name })).sort((a, b) => a.label.localeCompare(b.label, "es")),
    ],
    [staff],
  );

  const responsable = (
    <div data-slot="filter-group" data-group="responsable" className="flex items-center gap-2">
      <span aria-hidden="true" className="font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase">
        {ANALITICO_RESPONSABLE_LABEL}
      </span>
      <Select
        items={responsableItems}
        value={query.responsable ?? RESPONSABLE_TODOS}
        onValueChange={(value) =>
          onQuery({ responsable: typeof value !== "string" || value === RESPONSABLE_TODOS ? null : value })
        }
      >
        <SelectTrigger aria-label={ANALITICO_RESPONSABLE_LABEL} className="h-[34px] w-auto min-w-28 rounded-[8px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {responsableItems.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {responsableFilter(query.responsable) ? (
        <IncludeSupportSwitch checked={query.apoyo !== false} onCheckedChange={(on) => onQuery({ apoyo: on })} />
      ) : null}
    </div>
  );

  // ── Empty, error, totals.
  const emptyState: EmptyStateProps = late ? { ...empty, title: ANALITICO_EMPTY_LATE_TITLE } : { ...empty, title: ANALITICO_EMPTY_TITLE };
  const note = late && !summaryLoading ? hiddenProjectsNote(summary) : null;
  const totals = summary.projects.length > 0 && !summaryLoading ? analiticoTotals(summary, mostrar) : null;

  return (
    <div
      data-slot="tareas-analitico"
      className="flex min-w-0 flex-col gap-5"
      onClickCapture={onRowsClickCapture}
      {...cells.primeProps}
    >
      <PageHeader title="Tareas" description={description} actions={actions} />
      {startSlot}
      <FilterCard
        groups={filterGroups}
        onChange={onFilterChange}
        extra={
          <>
            {responsable}
            <ProjectFilter
              showLabel
              options={facets.projects}
              selected={selectedProyectos(query)}
              onChange={(ids) => onQuery(proyectosPatch(ids))}
              triggerClassName="h-[34px] rounded-[8px]"
            />
            <HideCompletedSwitch checked={hiding} onCheckedChange={onHideCompleted} />
            <div data-slot="show-hours" className="flex items-center gap-2">
              <Switch id={hoursSwitchId} checked={showHours} onCheckedChange={(value) => setShowHours(Boolean(value))} />
              <label htmlFor={hoursSwitchId} className="cursor-pointer text-[12.5px] whitespace-nowrap text-foreground">
                {SHOW_HOURS_COLUMN_LABEL}
              </label>
            </div>
          </>
        }
        search={{ value: search, onChange: onSearch, placeholder: ANALITICO_SEARCH_LABEL, label: ANALITICO_SEARCH_LABEL }}
      />
      <KpiStrip items={analiticoKpis(summary, mostrar)} loading={summaryLoading} />
      <CellCommitProvider queryKeys={TAREAS_CELL_KEYS}>
        <GroupedTable<AnaliticoRow>
          label={ANALITICO_TABLE_LABEL}
          columns={columns}
          groups={groups}
          anchors={anchors}
          anchorsCaption={ANALITICO_ANCHORS_CAPTION}
          expanded={expanded}
          onExpandedChange={onExpandedChange}
          heat={[ANALITICO_DAYS_LATE_HEAT]}
          sortable={ANALITICO_SORTABLE}
          sort={tableSort}
          onSortChange={onSortChange}
          getRowId={(row) => row.id}
          renderCell={renderAnaliticoTaskCell}
          rowHref={rowHref}
          rowDetail={subtasks.rowDetail}
          toolbar={
            subtasks.parentCount > 0 ? (
              <Button type="button" variant="link" size="sm" onClick={() => void onToggleAllSubtasks()}>
                {allSubtasksOpen ? SUBTASKS_COLLAPSE_ALL : SUBTASKS_EXPAND_ALL}
              </Button>
            ) : null
          }
          isRowNew={(row) => created.has(row.id)}
          isRowMuted={(row) => row.closed}
          getRowLabel={(row) => row.tarea}
          selectable
          selectedIds={selection.selectedIds}
          onSelectionChange={selection.onSelectionChange}
          rowActions={(row) => deletes.rowActions(deleteTargetOf(row.task), () => openTask(row.id))}
          onRowDelete={deletes.canDelete ? (row) => deletes.request([deleteTargetOf(row.task)]) : undefined}
          onLoadMore={(id) => rowActions.current.get(id)?.more()}
          loading={summaryLoading}
          error={summaryQuery.isError && !summaryQuery.data ? { title: "No se pudo cargar", onRetry: () => void summaryQuery.refetch() } : undefined}
          emptyState={emptyState}
        />
      </CellCommitProvider>
      {note ? (
        <p data-slot="hidden-projects" className="rounded-[14px] border border-dashed border-input px-4 py-2.5 text-[12.5px] text-muted-foreground">
          {note}
        </p>
      ) : null}
      {totals ? (
        <div
          data-slot="tareas-totals"
          className="flex flex-wrap justify-between gap-2 rounded-[14px] border bg-muted px-4 py-3 text-[12.5px] font-semibold text-foreground"
        >
          <span>{totals.label}</span>
          <span className="font-mono">{totals.summary}</span>
        </div>
      ) : null}
      {deletes.dialog}
      <TaskBulkBar selection={selection} taskOf={taskOfId} staff={staff} deletes={deletes} />
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {openGroups.map((g) => (
        <GroupRowsLoader key={g.id} id={g.id} filters={g.filters} onState={onGroupState} actions={rowActions} />
      ))}
    </div>
  );
}
