"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { ErrorState } from "@/components/shell/ErrorState";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { FilterCard, type FilterGroup } from "@/components/widgets/FilterCard";
import { GroupedTable, type Group, type GroupAnchor } from "@/components/widgets/GroupedTable";
import { KpiStrip } from "@/components/widgets/KpiStrip";
import { QuickAddRow, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { tareasListInfiniteOptions, tareasSummaryOptions } from "@/lib/query/options/tareas";
import { selectAnaliticoCollapsed, useTareasUi } from "@/lib/stores/tareas-ui-store";
import type { TareasFacets, TareasStaffOption } from "@/lib/tareas/page-data";
import type { TareasMostrar, TareasQuery } from "@/lib/tareas/query";
import { EMPTY_TAREAS_SUMMARY, tareasGroupFilters, type TareasSummary } from "@/lib/tareas/summary";
import { tramoColorVar } from "@/lib/tramos/compat";
import { statusDotClass } from "@/lib/tasks/status-options";
import type { TareasListFilters } from "@/lib/query/keys";
import type { TaskListRow, WorkflowRef } from "@/lib/types/core";
import { cn } from "@/lib/utils";

import { useQuickAddCreate } from "./quick-add-create";
import {
  ANALITICO_ANCHORS_CAPTION,
  ANALITICO_COLUMNS,
  ANALITICO_DAYS_LATE_HEAT,
  ANALITICO_DESCRIPTION,
  ANALITICO_EMPTY_LATE_TITLE,
  ANALITICO_EMPTY_TITLE,
  ANALITICO_TABLE_LABEL,
  analiticoKpis,
  analiticoRow,
  analiticoTotals,
  daysLateLabel,
  expandAnnouncement,
  hiddenProjectsNote,
  projectCaption,
  projectFooter,
  projectGroupId,
  projectMetrics,
  tramoCaption,
  tramoGroupId,
  tramoMetrics,
  type AnaliticoRow,
} from "./tareas-analitico";
import { localIsoDate } from "./tablero-table";
import { useTareasFilters, useTareasPageReady } from "./use-tareas-page";

export const ANALITICO_SEARCH_LABEL = "Buscar tareas";
export const ANALITICO_RESPONSABLE_LABEL = "Responsable";

const RESPONSABLE_TODOS = "todos";
const RESPONSABLE_YO = "yo";
const TRAMO_TODOS = "todos";

const MOSTRAR_LABEL: Record<TareasMostrar, string> = { todas: "Todas", abiertas: "Abiertas", en_retraso: "En retraso" };
const MOSTRAR_ORDER: readonly TareasMostrar[] = ["todas", "abiertas", "en_retraso"];

export type TareasAnaliticoProps = {
  query: TareasQuery;
  facets: TareasFacets;
  tramos: WorkflowRef[];
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
};

/** What one tramo group's rows query reports to the page. */
type GroupRowsState = { rows: TaskListRow[] | undefined; loading: boolean; error: boolean; hasMore: boolean };
type GroupRowsActions = { more(): void; retry(): void };

/**
 * One tramo group's rows (`useInfiniteQuery(tareas.list(groupFilters))`,
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
  const { fetchNextPage, refetch } = list;

  useEffect(() => {
    const map = actions.current;
    map.set(id, { more: () => void fetchNextPage(), retry: () => void refetch() });
    return () => {
      map.delete(id);
    };
  }, [id, fetchNextPage, refetch, actions]);

  useEffect(() => {
    onState(id, { rows, loading, error, hasMore });
  }, [id, rows, loading, error, hasMore, onState]);

  return null;
}

function sameState(a: GroupRowsState | undefined, b: GroupRowsState): boolean {
  return !!a && a.rows === b.rows && a.loading === b.loading && a.error === b.error && a.hasMore === b.hasMore;
}

/**
 * Tareas · Analítico (frames `Main`, `Analitico-Vencidas`, Estilos #988):
 * every task in tables grouped project → tramo, ordered by delay. Header,
 * `FilterCard` (Mostrar, Tramo, Responsable, search; synced with the URL),
 * `KpiStrip`, then `GroupedTable` with the "Ir a" row, one section per
 * project (overdue desc, then name) and one group per tramo, each with its
 * own rows query, a quick-add row (not in En retraso) and a footer. Every
 * count comes from `tareas.summary(f)`. En retraso hides projects and tramos
 * without overdue tasks and names the hidden projects. Every group starts
 * expanded; what the viewer collapses is remembered in `useTareasUi`.
 */
export function TareasAnalitico({
  query,
  facets,
  tramos,
  staff,
  actions,
  search,
  onSearch,
  onQuery,
  empty,
  canCreate,
}: TareasAnaliticoProps) {
  const f = useTareasFilters(query);
  const ready = useTareasPageReady(query);
  const summaryQuery = useQuery({ ...tareasSummaryOptions(f), enabled: ready });
  const summary: TareasSummary = summaryQuery.data ?? EMPTY_TAREAS_SUMMARY;
  const summaryLoading = !summaryQuery.data && (summaryQuery.isPending || !ready);
  const mostrar = query.mostrar;
  const late = mostrar === "en_retraso";
  const today = localIsoDate();

  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ── Expansion: every group open but the collapsed ones (kept per user in the store).
  const collapsed = useTareasUi(selectAnaliticoCollapsed);
  const setCollapsed = useTareasUi((s) => s.setAnaliticoCollapsed);
  const allIds = useMemo(
    () =>
      summary.projects.flatMap((p) => [
        projectGroupId(p.project.id),
        ...p.tramos.map((t) => tramoGroupId(p.project.id, t.tramo.id)),
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

  // ── Rows per open tramo group.
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
          : p.tramos
              .filter((t) => !collapsedSet.has(tramoGroupId(p.project.id, t.tramo.id)))
              .map((t) => ({ id: tramoGroupId(p.project.id, t.tramo.id), filters: tareasGroupFilters(f, p.project.id, t.tramo.key) })),
      ),
    [summary.projects, collapsedSet, f],
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

  const groups = useMemo<Group<AnaliticoRow>[]>(
    () =>
      summary.projects.map((p) => ({
        id: projectGroupId(p.project.id),
        label: p.project.name,
        caption: projectCaption(summary, p, mostrar),
        metrics: projectMetrics(p),
        footer: projectFooter(p, mostrar),
        children: p.tramos.map((t) => {
          const id = tramoGroupId(p.project.id, t.tramo.id);
          const state = groupRows[id];
          const tramoRef = t.tramo.key ? tramos.find((w) => w.id === t.tramo.id) : undefined;
          const failed = state?.error === true;
          return {
            id,
            label: t.tramo.name,
            color: t.tramo.key ? tramoColorVar(t.tramo.key, tramoRef?.sortOrder ?? t.tramo.sortOrder) : undefined,
            caption: tramoCaption(summary, p.project.id, t, mostrar),
            metrics: tramoMetrics(t, mostrar),
            rows: failed ? [] : state?.rows?.map((row) => analiticoRow(row, today)),
            loading: !failed && (state?.loading ?? false),
            hasMore: state?.hasMore ?? false,
            quickAdd: failed ? (
              <tr>
                <td colSpan={ANALITICO_COLUMNS.length} className="border-b border-border px-3 py-2">
                  <ErrorState title="No se pudo cargar" onRetry={() => rowActions.current.get(id)?.retry()} />
                </td>
              </tr>
            ) : canCreate && !late ? (
              <QuickAddRow
                variant="row"
                colSpan={ANALITICO_COLUMNS.length}
                context={{
                  label: `Nueva tarea en ${t.tramo.name}`,
                  projectId: p.project.id,
                  tramoId: t.tramo.id,
                  placeholder: `Nueva tarea en ${t.tramo.name}…`,
                }}
                onCreate={onCreate}
              />
            ) : undefined,
          };
        }),
      })),
    [summary, mostrar, groupRows, tramos, today, canCreate, late, onCreate],
  );

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

  // ── `?tarea=<id>` opens the task sheet over the table.
  const rowHref = useCallback(
    (row: AnaliticoRow) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tarea", row.id);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams],
  );

  const renderCell = useCallback((columnKey: string, row: AnaliticoRow): ReactNode | undefined => {
    switch (columnKey) {
      case "tarea":
        return (
          <span title={row.tarea} className="block max-w-[420px] truncate">
            {row.tarea}
          </span>
        );
      case "responsable":
        return (
          <span title={row.responsable} className="block max-w-[180px] truncate">
            {row.responsable}
          </span>
        );
      case "estatus":
        return (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-[7px] shrink-0 rounded-full", statusDotClass(row.statusToken))} />
            {row.estatus}
          </span>
        );
      case "vence":
        return <span className={row.overdue ? "text-destructive" : undefined}>{row.vence}</span>;
      case "diasRetraso":
        if (row.diasRetraso <= 0) return "—";
        return (
          <>
            <span aria-hidden="true">{row.diasRetraso}</span>
            <span className="sr-only">{daysLateLabel(row.diasRetraso)}</span>
          </>
        );
      default:
        return undefined;
    }
  }, []);

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
        id: "tramo",
        label: "Tramo",
        value: query.tramo ?? TRAMO_TODOS,
        options: [
          { value: TRAMO_TODOS, label: "Todos" },
          ...tramos.map((t) => ({ value: t.key, label: t.name, color: tramoColorVar(t.key, t.sortOrder) })),
        ],
      },
    ],
    [mostrar, facets.mostrar, query.tramo, tramos],
  );

  const onFilterChange = useCallback(
    (groupId: string, value: string) => {
      if (groupId === "mostrar") onQuery({ mostrar: value as TareasMostrar });
      else if (groupId === "tramo") onQuery({ tramo: value === TRAMO_TODOS ? null : value });
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
    </div>
  );

  // ── Empty, error, totals.
  const emptyState: EmptyStateProps = late ? { ...empty, title: ANALITICO_EMPTY_LATE_TITLE } : { ...empty, title: ANALITICO_EMPTY_TITLE };
  const note = late && !summaryLoading ? hiddenProjectsNote(summary) : null;
  const totals = summary.projects.length > 0 && !summaryLoading ? analiticoTotals(summary, mostrar) : null;

  return (
    <div data-slot="tareas-analitico" className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Tareas" description={ANALITICO_DESCRIPTION} actions={actions} />
      <FilterCard
        groups={filterGroups}
        onChange={onFilterChange}
        extra={responsable}
        search={{ value: search, onChange: onSearch, placeholder: ANALITICO_SEARCH_LABEL, label: ANALITICO_SEARCH_LABEL }}
      />
      <KpiStrip items={analiticoKpis(summary, mostrar)} loading={summaryLoading} />
      <GroupedTable<AnaliticoRow>
        label={ANALITICO_TABLE_LABEL}
        columns={ANALITICO_COLUMNS}
        groups={groups}
        anchors={anchors}
        anchorsCaption={ANALITICO_ANCHORS_CAPTION}
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        heat={[ANALITICO_DAYS_LATE_HEAT]}
        getRowId={(row) => row.id}
        renderCell={renderCell}
        rowHref={rowHref}
        isRowNew={(row) => created.has(row.id)}
        isRowMuted={(row) => row.closed}
        onLoadMore={(id) => rowActions.current.get(id)?.more()}
        loading={summaryLoading}
        error={summaryQuery.isError && !summaryQuery.data ? { title: "No se pudo cargar", onRetry: () => void summaryQuery.refetch() } : undefined}
        emptyState={emptyState}
      />
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
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {openGroups.map((g) => (
        <GroupRowsLoader key={g.id} id={g.id} filters={g.filters} onState={onGroupState} actions={rowActions} />
      ))}
    </div>
  );
}
