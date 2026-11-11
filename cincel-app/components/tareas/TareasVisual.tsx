"use client";

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { PageHeader, type PageHeaderProps } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { HideCompletedSwitch } from "@/components/widgets/HideCompletedSwitch";
import { ProjectFilter } from "@/components/widgets/ProjectFilter";
import { QuickAddRow, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { TaskBoardWidget } from "@/components/widgets/TaskBoardWidget";
import {
  KpiSparkTiles,
  KpiSparkTilesSkeleton,
  StatusDonutCard,
  SummaryCardSkeleton,
  WeekStripCard,
} from "@/components/widgets/TaskSummaryCards";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { TASK_TREND_TIME_ZONE, localIsoDate } from "@/lib/dashboard/task-trend";
import { tareasBoardOptions, tareasTrendOptions } from "@/lib/query/options/tareas";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { boardOfColumns, columnKeyOfRow, type TareasBoardData, type TareasFacets } from "@/lib/tareas/page-data";
import { useHideCompletedPreference } from "@/lib/stores/appearance-store";
import {
  hasTareasFilters,
  hideCompletedPatch,
  isHidingCompleted,
  proyectosPatch,
  selectedProyectos,
  type TareasMostrar,
  type TareasQuery,
} from "@/lib/tareas/query";
import { BASE_STATUS_LABEL, parseStatusValue } from "@/lib/tasks/status-options";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";
import { cn } from "@/lib/utils";

import { useQuickAddCreate } from "./quick-add-create";
import { tableroTable } from "./tablero-table";
import { findBoardRow, useTableroMove } from "./TareasTablero";
import {
  TAREAS_DONUT_TITLE,
  TAREAS_VISUAL_DESCRIPTION,
  TAREAS_VISUAL_SUMMARY_LABEL,
  TAREAS_VISUAL_VISIBLE_CARDS,
  TAREAS_WEEK_TITLE,
  donutSegmentsOfBoard,
  formatCount,
  trendTiles,
  weekMeta,
  weekStripDays,
} from "./tareas-visual-model";
import { useTareasFilters, useTareasPageReady } from "./use-tareas-page";

export const TAREAS_VISUAL_SEARCH_PLACEHOLDER = "Buscar tareas";
export const TAREAS_VISUAL_SOLO_MIAS = "Solo mías";
export const TAREAS_VISUAL_QUICK_ADD_PLACEHOLDER = "Escribe para agregar una tarea…";
export const TAREAS_VISUAL_ERROR = "No se pudo cargar";

const MOSTRAR_CHIPS: { key: TareasMostrar; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "abiertas", label: "Abiertas" },
  { key: "en_retraso", label: "En retraso" },
];

const NO_BOARD: TareasBoardData = { columns: {}, statuses: [] };

/** Pills of the Visual filter row: h32, rounded, 12.5 / 500, the count in mono. */
const CHIP_CLASS = "h-8 rounded-full px-3 text-[12.5px] font-medium";

export type TareasVisualProps = {
  query: TareasQuery;
  facets: TareasFacets;
  tramos: WorkflowRef[];
  /** "Nueva tarea" (the Estilo switch is added by `PageHeader`). */
  actions: ReactNode;
  /** The search box text (debounced into `?q=` by the page). */
  search: string;
  onSearch(value: string): void;
  /** Writes a filter patch to the URL (no server render). */
  onQuery(patch: Partial<TareasQuery>): void;
  /** "No hay tareas con estos filtros" with "Quitar filtros". */
  empty: EmptyStateProps;
  /** Project Flow's start slot under the header (only with one tramo filter). */
  startSlot?: ReactNode;
};

/** True when the target of a key press is a field (the `n` shortcut leaves typing alone). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.getAttribute("role") === "combobox";
}

/**
 * Tareas · Visual (frame `Tareas-Visual`, Estilos #986): the team board.
 * Header, a "Resumen" row (KPI tiles with 7-day sparklines from
 * `tareas.trend(f)`, the "Por estatus" donut over the board totals and the
 * "Esta semana" strip), the filter pills (Mostrar, tramo, Solo mías, search)
 * and the kanban (`TaskBoardWidget`): drag or "Mover a…" moves a card
 * (optimistic, rolled back with a toast), 4 cards per column before "Ver N
 * más", and a quick-add at the foot of every column in its status. `n`
 * focuses the first column's quick-add. The board stays usable when the
 * trend fails.
 */
export function TareasVisual({
  query,
  facets,
  tramos,
  actions,
  search,
  onSearch,
  onQuery,
  empty,
  startSlot,
}: TareasVisualProps) {
  const f = useTareasFilters(query);
  const ready = useTareasPageReady(query);
  const boardQuery = useQuery({ ...tareasBoardOptions(f), enabled: ready });
  const trendQuery = useQuery(tareasTrendOptions(f));
  const data = boardQuery.data ?? NO_BOARD;
  const board = useMemo(() => boardOfColumns(data.columns), [data]);
  const table = useMemo(() => tableroTable(board), [board]);
  const columnPages = useMemo(() => ({ filters: f, columns: data.columns }), [f, data]);

  const user = useSessionStore(selectAuthenticatedUser);
  const capabilities = useMemo(() => resolveActivitiesCapabilities(user), [user]);
  const viewerId = user?.member.id ?? null;

  // ── Moves (drag and "Mover a…"): optimistic on `tareas.board(f)`.
  const qc = useQueryClient();
  const { mutate } = useTableroMove(f);
  const onMove = useCallback(
    (taskId: string, columnKey: string) => {
      const row = findBoardRow(qc, f, taskId);
      if (row && columnKeyOfRow(row) === columnKey) return;
      mutate({ taskId, columnKey, projectId: row?.project.id ?? null });
    },
    [qc, f, mutate],
  );
  const canMove = useCallback(
    (task: TaskListItem) => {
      if (capabilities.statusScope === "all") return true;
      if (capabilities.statusScope === "none" || !viewerId) return false;
      return task.manager?.id === viewerId || task.support.some((s) => s.id === viewerId);
    },
    [capabilities.statusScope, viewerId],
  );

  // ── Quick-add per column: the column fixes the status; the project comes from the filter or the line.
  const quickAdd = useQuickAddCreate();
  const onCreate = useCallback((draft: QuickAddDraft) => quickAdd.create(draft), [quickAdd]);
  const tramoId = query.tramo ? (tramos.find((t) => t.key === query.tramo)?.id ?? null) : null;
  const columnLabel = useCallback(
    (key: string) => {
      const parsed = parseStatusValue(key);
      if (parsed.kind === "base") return BASE_STATUS_LABEL[parsed.status];
      return data.statuses.find((s) => s.id === parsed.id)?.name ?? key;
    },
    [data.statuses],
  );
  const renderColumnFooter = useCallback(
    (columnKey: string) =>
      capabilities.canCreateActivity ? (
        <div data-quick-add-column={columnKey}>
          <QuickAddRow
            variant="column"
            context={{
              label: columnLabel(columnKey),
              projectId: query.proyecto,
              tramoId,
              status: columnKey,
              placeholder: TAREAS_VISUAL_QUICK_ADD_PLACEHOLDER,
            }}
            onCreate={onCreate}
          />
        </div>
      ) : null,
    [capabilities.canCreateActivity, columnLabel, query.proyecto, tramoId, onCreate],
  );

  // ── `n`: focus the first column's quick-add (not while typing in a field).
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "n" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isTypingTarget(event.target)) return;
      const field = rootRef.current?.querySelector<HTMLElement>(
        "[data-quick-add-column] input, [data-quick-add-column] textarea",
      );
      if (!field) return;
      event.preventDefault();
      field.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Summary.
  const today = localIsoDate(new Date(), TASK_TREND_TIME_ZONE);
  const segments = useMemo(() => donutSegmentsOfBoard(data), [data]);
  const boardTotal = segments.reduce((sum, s) => sum + s.value, 0);
  const trend = trendQuery.data;
  const boardLoading = !boardQuery.data && (boardQuery.isPending || !ready);

  let summary: ReactNode;
  if (trendQuery.isError && !trend) {
    summary = (
      <div className="lg:col-span-3">
        <ErrorState title={TAREAS_VISUAL_ERROR} onRetry={() => void trendQuery.refetch()} />
      </div>
    );
  } else {
    summary = (
      <>
        {trend ? <KpiSparkTiles tiles={trendTiles(trend)} /> : <KpiSparkTilesSkeleton />}
        {boardLoading ? (
          <SummaryCardSkeleton label={TAREAS_DONUT_TITLE} />
        ) : (
          <StatusDonutCard
            title={TAREAS_DONUT_TITLE}
            segments={segments}
            total={boardTotal}
            totalText={formatCount(boardTotal)}
            unit={boardTotal === 1 ? "tarea" : "tareas"}
          />
        )}
        {trend ? (
          <WeekStripCard title={TAREAS_WEEK_TITLE} meta={weekMeta(trend.week)} days={weekStripDays(trend.week, today)} />
        ) : (
          <SummaryCardSkeleton label={TAREAS_WEEK_TITLE} />
        )}
      </>
    );
  }

  // ── Board, or the empty state when the filters leave nothing.
  let content: ReactNode;
  if (boardQuery.isError && !boardQuery.data) {
    content = <ErrorState title={TAREAS_VISUAL_ERROR} onRetry={() => void boardQuery.refetch()} />;
  } else if (!boardLoading && boardTotal === 0 && hasTareasFilters(query)) {
    content = <EmptyState {...empty} />;
  } else {
    content = (
      <TaskBoardWidget
        board={board}
        table={table}
        onMove={onMove}
        columnPages={columnPages}
        customStatuses={data.statuses}
        loading={boardLoading}
        renderColumnFooter={renderColumnFooter}
        visibleCards={TAREAS_VISUAL_VISIBLE_CARDS}
        compactCompleted
        hideCompleted={isHidingCompleted(query)}
        canMove={canMove}
      />
    );
  }

  const header: PageHeaderProps = { title: "Tareas", description: TAREAS_VISUAL_DESCRIPTION, actions };

  return (
    <div ref={rootRef} data-testid="tareas-visual" className="flex flex-col gap-5">
      <PageHeader {...header} />
      {startSlot}
      <section
        aria-label={TAREAS_VISUAL_SUMMARY_LABEL}
        className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.4fr_1fr_1.6fr]"
      >
        {summary}
      </section>
      <TareasVisualFilters
        query={query}
        facets={facets}
        tramos={tramos}
        search={search}
        onSearch={onSearch}
        onQuery={onQuery}
      />
      {content}
    </div>
  );
}

/**
 * The Visual filter row (`role="group" aria-label="Filtros"`): Mostrar
 * (Todas, Abiertas, En retraso; single-select, Todas also clears the tramo),
 * the tramo pills (single-select, a second click clears it), Solo mías
 * (`responsable=yo`), Proyecto (multi-select, #1045) and the search. Pills
 * are `aria-pressed` buttons.
 */
function TareasVisualFilters({
  query,
  facets,
  tramos,
  search,
  onSearch,
  onQuery,
}: Pick<TareasVisualProps, "query" | "facets" | "tramos" | "search" | "onSearch" | "onQuery">) {
  const mostrarCount = (key: TareasMostrar) => facets.mostrar?.[key] ?? (key === "todas" ? facets.total : undefined);
  const soloMias = query.responsable === "yo";
  // "Ocultar completadas" (#1039): hides the Completado column; remembered per user and in the URL.
  const [, setHidePreference] = useHideCompletedPreference();
  const onHideCompleted = (hide: boolean) => {
    setHidePreference(hide);
    onQuery(hideCompletedPatch(hide, query));
  };

  return (
    <div role="group" aria-label="Filtros" className="flex flex-wrap items-center gap-2">
      {MOSTRAR_CHIPS.map((chip) => {
        const pressed = query.mostrar === chip.key;
        const count = mostrarCount(chip.key);
        const late = chip.key === "en_retraso";
        return (
          <Button
            key={chip.key}
            type="button"
            size="sm"
            variant={pressed ? "default" : "outline"}
            aria-pressed={pressed}
            className={CHIP_CLASS}
            onClick={() => onQuery(chip.key === "todas" ? { mostrar: "todas", tramo: null } : { mostrar: chip.key })}
          >
            {late ? <span aria-hidden="true" className="size-2 rounded-full bg-destructive" /> : null}
            {chip.label}
            {count !== undefined ? (
              <span data-slot="chip-count" className={cn("font-mono", late && !pressed && "text-destructive")}>
                {formatCount(count)}
              </span>
            ) : null}
          </Button>
        );
      })}
      <span aria-hidden="true" className="h-5 w-px bg-border" />
      {tramos.map((tramo) => {
        const pressed = query.tramo === tramo.key;
        return (
          <Button
            key={tramo.key}
            type="button"
            size="sm"
            variant={pressed ? "default" : "outline"}
            aria-pressed={pressed}
            className={CHIP_CLASS}
            onClick={() => onQuery({ tramo: pressed ? null : tramo.key })}
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: tramoColorVar(tramo.key, tramo.sortOrder) }}
            />
            {tramo.name}
            <span data-slot="chip-count" className="font-mono">
              {formatCount(facets.byTramo[tramo.key] ?? 0)}
            </span>
          </Button>
        );
      })}
      <span aria-hidden="true" className="h-5 w-px bg-border" />
      <Button
        type="button"
        size="sm"
        variant={soloMias ? "default" : "outline"}
        aria-pressed={soloMias}
        className={CHIP_CLASS}
        onClick={() => onQuery({ responsable: soloMias ? null : "yo" })}
      >
        {TAREAS_VISUAL_SOLO_MIAS}
        {facets.mine !== undefined ? (
          <span data-slot="chip-count" className="font-mono">
            {formatCount(facets.mine)}
          </span>
        ) : null}
      </Button>
      <span aria-hidden="true" className="h-5 w-px bg-border" />
      <ProjectFilter
        options={facets.projects}
        selected={selectedProyectos(query)}
        onChange={(ids) => onQuery(proyectosPatch(ids))}
        triggerClassName={CHIP_CLASS}
      />
      <span aria-hidden="true" className="h-5 w-px bg-border" />
      <HideCompletedSwitch checked={isHidingCompleted(query)} onCheckedChange={onHideCompleted} />
      <div className="relative ml-auto">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          aria-label={TAREAS_VISUAL_SEARCH_PLACEHOLDER}
          placeholder={TAREAS_VISUAL_SEARCH_PLACEHOLDER}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-8 w-40 rounded-[10px] pl-8"
        />
      </div>
    </div>
  );
}
