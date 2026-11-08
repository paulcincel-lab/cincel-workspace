"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { FiltersBar, type FiltersBarProps } from "@/components/patterns/FiltersBar";
import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { EstiloSwitch } from "@/components/shell/EstiloSwitch";
import { PageHeader, type PageHeaderProps } from "@/components/shell/PageHeader";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import {
  clearTareasFilters,
  hasTareasFilters,
  tareasCalendarRange,
  tareasHref,
  type TareasQuery,
  type TareasVista,
} from "@/lib/tareas/query";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { TaskFilters, TaskListItem, TaskStatus, TaskStatusOption, WorkflowRef } from "@/lib/types/core";
import type { CalendarData, StaffOption, TaskBoard } from "@/lib/types/redesign";

import { NewTaskDialog } from "./NewTaskDialog";
import { CALENDARIO_DESCRIPTION, TareasCalendario } from "./TareasCalendario";
import { TareasFilterCombobox, type TareasFilterOption } from "./TareasFilterCombobox";
import { TareasLista } from "./TareasLista";
import { TABLERO_DESCRIPTION, TareasTablero } from "./TareasTablero";
import { TaskSheetRoute } from "./TaskSheet";
import { useNewTaskParam } from "./use-new-task-param";

export type TareasClientProps = {
  query: TareasQuery;
  /**
   * `tasks`: the tasks matching every filter except tramo and proyecto (they
   * feed the tramo chip counts and the Proyecto options; the views get them
   * narrowed by tramo and proyecto). `board` (Tablero) and `calendar`
   * (Calendario) come with every filter applied. `statuses` (Tablero): every
   * configured custom status, so its column shows even when empty.
   */
  initial: { tasks?: TaskListItem[]; board?: TaskBoard; calendar?: CalendarData; statuses?: TaskStatusOption[] };
  staff: StaffOption[];
  tramos: WorkflowRef[];
};

/** Header description per view (FE §3.4). */
export const TAREAS_DESCRIPTIONS: Record<TareasVista, string> = {
  tablero: TABLERO_DESCRIPTION,
  lista: "Todas los tramos en un solo lugar. Ordena por columna o agrupa por estatus.",
  calendario: CALENDARIO_DESCRIPTION,
};

const VISTA_LABELS: Record<TareasVista, string> = {
  tablero: "Tablero",
  lista: "Lista",
  calendario: "Calendario",
};

const VISTAS: readonly TareasVista[] = ["tablero", "lista", "calendario"];

export const TAREAS_EMPTY_TITLE = "No hay tareas con estos filtros";
export const TAREAS_CLEAR_FILTERS = "Quitar filtros";
export const TAREAS_SEARCH_PLACEHOLDER = "Buscar tareas";

/** Pause after typing before the search box writes `q` to the URL. */
export const TAREAS_SEARCH_DEBOUNCE_MS = 300;

const RESPONSABLE_YO = "yo";
const RESPONSABLE_TODOS = "todos";
const PROYECTO_TODOS = "todos";

function staffName(s: Pick<StaffOption, "name" | "lastName">): string {
  return [s.name, s.lastName].filter(Boolean).join(" ").trim();
}

function boardOf(tasks: TaskListItem[]): TaskBoard {
  const board: TaskBoard = { pendiente: [], en_proceso: [], completado: [], bloqueado: [] };
  for (const task of tasks) board[task.status].push(task);
  return board;
}

/** Segmented view switch: links that keep every other filter (FE §3.4). */
function ViewSwitch({ query }: { query: TareasQuery }) {
  return (
    <nav aria-label="Vista" className="inline-flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {VISTAS.map((vista) => {
        const active = vista === query.vista;
        return (
          <Link
            key={vista}
            href={tareasHref({ ...query, nueva: false, vista })}
            aria-current={active ? "page" : undefined}
            scroll={false}
            className={buttonVariants({ variant: active ? "outline" : "ghost", size: "sm" })}
          >
            {VISTA_LABELS[vista]}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * /tareas client (redesign FE §3.4, §4.5; evolves `MisTareasClient` /
 * `ActividadesClient`): header with the view switch and "Nueva tarea",
 * URL-synced filters (tramo chips, "Responsable: Yo", Proyecto, search) and
 * the selected view: Tablero (`TareasTablero`), Lista (`TareasLista`) or
 * Calendario (`TareasCalendario`). Filters write the URL with
 * `router.replace` (no scroll); the page re-renders with the new query, so
 * back / forward restore them.
 */
export function TareasClient({ query, initial, staff, tramos }: TareasClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const newTask = useNewTaskParam();
  const authenticatedUser = useSessionStore(selectCurrentUser);
  const capabilities = useMemo(() => resolveActivitiesCapabilities(authenticatedUser), [authenticatedUser]);
  const viewerId = authenticatedUser?.member.id ?? null;

  const replaceQuery = useCallback(
    (patch: Partial<TareasQuery>) => {
      startTransition(() => {
        router.replace(tareasHref({ ...query, nueva: false, ...patch }), { scroll: false });
      });
    },
    [router, query],
  );

  // ── Search: local text, written to `q` after a pause. A URL change from
  // elsewhere (back / forward, "Quitar filtros") resets the box.
  const urlSearch = query.q ?? "";
  const [search, setSearch] = useState(urlSearch);
  const [sentSearch, setSentSearch] = useState(urlSearch);
  const [seenUrlSearch, setSeenUrlSearch] = useState(urlSearch);
  if (urlSearch !== seenUrlSearch) {
    setSeenUrlSearch(urlSearch);
    if (urlSearch !== sentSearch) {
      setSearch(urlSearch);
      setSentSearch(urlSearch);
    }
  }
  useEffect(() => {
    const text = search.trim();
    if (text === sentSearch) return;
    const id = window.setTimeout(() => {
      setSentSearch(text);
      replaceQuery({ q: text || null });
    }, TAREAS_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [search, sentSearch, replaceQuery]);

  // ── Facets: the tasks without the tramo / proyecto filters give the counts and options.
  const tasks = useMemo(() => initial.tasks ?? [], [initial.tasks]);
  const inTramo = useCallback(
    (t: TaskListItem) => query.tramo === null || t.workflow?.key === query.tramo,
    [query.tramo],
  );
  const inProject = useCallback(
    (t: TaskListItem) => query.proyecto === null || t.project.id === query.proyecto,
    [query.proyecto],
  );
  const viewTasks = useMemo(() => tasks.filter((t) => inTramo(t) && inProject(t)), [tasks, inTramo, inProject]);

  const chips = useMemo<NonNullable<FiltersBarProps["chips"]>>(() => {
    const inScope = tasks.filter(inProject);
    return [
      {
        key: "todas",
        label: "Todas",
        count: inScope.length,
        pressed: query.tramo === null,
        href: tareasHref({ ...query, nueva: false, tramo: null }),
      },
      ...tramos.map((tramo) => ({
        key: tramo.key,
        label: tramo.name,
        count: inScope.filter((t) => t.workflow?.key === tramo.key).length,
        colorVar: tramoColorVar(tramo.key),
        pressed: query.tramo === tramo.key,
        href: tareasHref({ ...query, nueva: false, tramo: tramo.key }),
      })),
    ];
  }, [tasks, tramos, query, inProject]);

  const responsableOptions = useMemo<TareasFilterOption[]>(
    () => [
      { value: RESPONSABLE_YO, label: "Yo" },
      { value: RESPONSABLE_TODOS, label: "Todos" },
      ...staff
        .filter((s) => s.id !== viewerId)
        .map((s) => ({ value: s.id, label: staffName(s) }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    ],
    [staff, viewerId],
  );

  const projectOptions = useMemo<TareasFilterOption[]>(() => {
    const projects = new Map<string, string>();
    for (const task of tasks) if (inTramo(task)) projects.set(task.project.id, task.project.name);
    if (query.proyecto && !projects.has(query.proyecto)) {
      const name = tasks.find((t) => t.project.id === query.proyecto)?.project.name;
      if (name) projects.set(query.proyecto, name);
    }
    return [
      { value: PROYECTO_TODOS, label: "Todos los proyectos" },
      ...[...projects.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    ];
  }, [tasks, inTramo, query.proyecto]);

  const filters = (
    <FiltersBar
      chips={chips}
      selects={[
        <TareasFilterCombobox
          key="responsable"
          label="Responsable"
          value={query.responsable ?? RESPONSABLE_TODOS}
          options={responsableOptions}
          searchPlaceholder="Buscar persona"
          onChange={(v) => replaceQuery({ responsable: v === RESPONSABLE_TODOS ? null : v })}
        />,
        <TareasFilterCombobox
          key="proyecto"
          label="Proyecto"
          value={query.proyecto ?? PROYECTO_TODOS}
          placeholderValue={PROYECTO_TODOS}
          options={projectOptions}
          searchPlaceholder="Buscar proyecto"
          onChange={(v) => replaceQuery({ proyecto: v === PROYECTO_TODOS ? null : v })}
        />,
      ]}
      search={{ value: search, placeholder: TAREAS_SEARCH_PLACEHOLDER, onChange: setSearch }}
    />
  );

  // ── Header and empty state.
  const canCreate = capabilities.canCreateActivity;
  const actions: ReactNode = (
    <>
      <ViewSwitch query={query} />
      {canCreate ? (
        <Button onClick={() => newTask.setOpen(true)}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          Nueva tarea
        </Button>
      ) : null}
    </>
  );
  const header: PageHeaderProps = { title: "Tareas", description: TAREAS_DESCRIPTIONS[query.vista], actions };

  const filtered = hasTareasFilters(query);
  const empty: EmptyStateProps = filtered
    ? {
        title: TAREAS_EMPTY_TITLE,
        action: { label: TAREAS_CLEAR_FILTERS, href: tareasHref(clearTareasFilters(query)) },
      }
    : { title: TAREAS_EMPTY_TITLE };

  // ── The selected view.
  let view: ReactNode;
  if (query.vista === "tablero") {
    view = (
      <TareasTablero
        board={initial.board ?? boardOf(viewTasks)}
        customStatuses={initial.statuses}
        header={header}
        filters={filters}
        empty={empty}
      />
    );
  } else if (query.vista === "lista") {
    view = (
      <TareasLista
        tasks={viewTasks}
        header={header}
        filters={filters}
        empty={empty}
        tramo={query.tramo}
        proyecto={query.proyecto}
        tramos={tramos}
      />
    );
  } else {
    const calendar = initial.calendar ?? [];
    view = (
      <TareasCalendarioView
        query={query}
        header={header}
        filters={filters}
        empty={filtered && viewTasks.length === 0 && calendar.length === 0 ? empty : null}
        calendar={calendar}
        tramos={tramos}
        viewerId={viewerId}
      />
    );
  }

  return (
    <>
      {view}
      {/* `?tarea=<id>` opens the task sheet over the view, which stays mounted. */}
      <TaskSheetRoute />
      {canCreate ? (
        <NewTaskDialog
          open={newTask.open}
          onOpenChange={newTask.setOpen}
          defaults={{ projectId: query.proyecto ?? undefined, tramoKey: query.tramo ?? undefined }}
        />
      ) : null}
    </>
  );
}

/** The filters the RSC loaded the calendar with, for the ranges the view fetches itself. */
export function calendarTaskFilters(query: TareasQuery, tramos: WorkflowRef[], viewerId: string | null): TaskFilters {
  const filters: TaskFilters = {};
  if (query.q) filters.search = query.q;
  if (query.estado) filters.status = query.estado as TaskStatus;
  if (query.responsable === "yo") {
    if (viewerId) filters.involvesStaffId = viewerId;
  } else if (query.responsable) {
    filters.involvesStaffId = query.responsable;
  }
  const tramo = query.tramo ? tramos.find((t) => t.key === query.tramo) : null;
  if (tramo) filters.workflowId = tramo.id;
  if (query.proyecto) filters.projectId = query.proyecto;
  return filters;
}

/**
 * Calendario has no `ListPage` spec: the shell renders the header (with the
 * `EstiloSwitch` that `ListPage` renders for the other views) and the filters
 * above `TareasCalendario`.
 */
function TareasCalendarioView({
  query,
  header,
  filters,
  empty,
  calendar,
  tramos,
  viewerId,
}: {
  query: TareasQuery;
  header: PageHeaderProps;
  filters: ReactNode;
  empty: EmptyStateProps | null;
  calendar: CalendarData;
  tramos: WorkflowRef[];
  viewerId: string | null;
}) {
  const initialRange = useMemo(() => tareasCalendarRange(query.cal, new Date()), [query.cal]);
  const taskFilters = useMemo(() => calendarTaskFilters(query, tramos, viewerId), [query, tramos, viewerId]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        {...header}
        actions={
          <>
            {header.actions}
            <EstiloSwitch />
          </>
        }
      />
      {filters}
      {empty ? (
        <EmptyState {...empty} />
      ) : (
        <TareasCalendario
          cal={query.cal}
          tasks={calendar}
          initialRange={initialRange}
          tramos={tramos}
          filters={taskFilters}
        />
      )}
    </div>
  );
}
