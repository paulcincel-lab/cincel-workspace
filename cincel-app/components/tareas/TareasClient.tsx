"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { FiltersBar, type FiltersBarProps } from "@/components/patterns/FiltersBar";
import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { PageHeader, type PageHeaderProps } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/shadcn/button";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { tareasFacetsOptions } from "@/lib/query/options/tareas";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { TareasFacets, TareasStaffOption } from "@/lib/tareas/page-data";
import {
  clearTareasFilters,
  hasTareasFilters,
  tareasHref,
  type TareasQuery,
  type TareasVista,
} from "@/lib/tareas/query";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { WorkflowRef } from "@/lib/types/core";

import { CALENDARIO_DESCRIPTION, TareasCalendario } from "./TareasCalendario";
import { TareasFilterCombobox, type TareasFilterOption } from "./TareasFilterCombobox";
import { TareasEsencial } from "./TareasEsencial";
import { TareasVisual } from "./TareasVisual";
import { TareasAnalitico } from "./TareasAnalitico";
import { TareasLista } from "./TareasLista";
import { TABLERO_DESCRIPTION, TareasTablero } from "./TareasTablero";
import { TaskSheetRoute } from "./TaskSheet";
import {
  replaceTareasUrl,
  useTareasFilters,
  useTareasPage,
  useTareasPageReady,
  useTareasQuery,
} from "./use-tareas-page";

/** Header description per view (FE §3.4). */
export const TAREAS_DESCRIPTIONS: Record<TareasVista, string> = {
  tablero: TABLERO_DESCRIPTION,
  lista: "Todas los tramos en un solo lugar. Ordena por columna o agrupa por estatus.",
  calendario: CALENDARIO_DESCRIPTION,
};

export const TAREAS_EMPTY_TITLE = "No hay tareas con estos filtros";
export const TAREAS_CLEAR_FILTERS = "Quitar filtros";
export const TAREAS_SEARCH_PLACEHOLDER = "Buscar tareas";

/** Pause after typing before the search box writes `q` to the URL. */
export const TAREAS_SEARCH_DEBOUNCE_MS = 300;

const RESPONSABLE_YO = "yo";
const RESPONSABLE_TODOS = "todos";
const PROYECTO_TODOS = "todos";

const NO_TRAMOS: WorkflowRef[] = [];
const NO_STAFF: TareasStaffOption[] = [];
const NO_FACETS: TareasFacets = { total: 0, byTramo: {}, projects: [] };

/**
 * /tareas client (redesign FE §3.4, §4.5; Query Migration 4a): header with
 * "Nueva tarea" (and the Estilo switch, which supersedes the old Vista
 * control: `?vista=` still parses so old links open, but nothing writes it
 * any more), URL-synced filters (tramo chips,
 * "Responsable: Yo", Proyecto, search) and the selected view: Tablero
 * (`TareasTablero`), Lista (`TareasLista`) or Calendario
 * (`TareasCalendario`). It takes no data: the query comes from the URL, the
 * chip counts and options from `tareas.facets(f)` and `tareas.page(q)`, and
 * each view reads its own query. Filters write the URL with
 * `history.replaceState` (no server render); the key change refetches.
 */
export function TareasClient() {
  const query = useTareasQuery();
  const filtersKey = useTareasFilters(query);
  const page = useTareasPage(query);
  const ready = useTareasPageReady(query);
  const facetsQuery = useQuery({ ...tareasFacetsOptions(filtersKey), enabled: ready });
  const facets = facetsQuery.data ?? page.data?.facets ?? NO_FACETS;
  const tramos = page.data?.tramos ?? NO_TRAMOS;
  const staff = page.data?.staff ?? NO_STAFF;

  const openNewTask = useNewTaskUi((s) => s.openNewTask);
  const authenticatedUser = useSessionStore(selectAuthenticatedUser);
  const capabilities = useMemo(() => resolveActivitiesCapabilities(authenticatedUser), [authenticatedUser]);
  const viewerId = authenticatedUser?.member.id ?? null;

  const replaceQuery = useCallback(
    (patch: Partial<TareasQuery>) => replaceTareasUrl(tareasHref({ ...query, nueva: false, ...patch })),
    [query],
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

  // ── Facets: counted on the server without the tramo / proyecto filters.
  const chips = useMemo<NonNullable<FiltersBarProps["chips"]>>(() => {
    const chip = (tramo: string | null) => {
      const href = tareasHref({ ...query, nueva: false, tramo });
      return { href, pressed: query.tramo === tramo, onSelect: () => replaceTareasUrl(href) };
    };
    return [
      { key: "todas", label: "Todas", count: facets.total, ...chip(null) },
      ...tramos.map((tramo) => ({
        key: tramo.key,
        label: tramo.name,
        count: facets.byTramo[tramo.key] ?? 0,
        colorVar: tramoColorVar(tramo.key),
        ...chip(tramo.key),
      })),
    ];
  }, [facets, tramos, query]);

  const responsableOptions = useMemo<TareasFilterOption[]>(
    () => [
      { value: RESPONSABLE_YO, label: "Yo" },
      { value: RESPONSABLE_TODOS, label: "Todos" },
      ...staff
        .filter((s) => s.id !== viewerId)
        .map((s) => ({ value: s.id, label: s.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    ],
    [staff, viewerId],
  );

  const projectOptions = useMemo<TareasFilterOption[]>(
    () => [
      { value: PROYECTO_TODOS, label: "Todos los proyectos" },
      ...facets.projects
        .map((p) => ({ value: p.id, label: p.name }))
        .sort((a, b) => a.label.localeCompare(b.label, "es")),
    ],
    [facets.projects],
  );

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
  const actions: ReactNode = canCreate ? (
    <Button
      onClick={() =>
        openNewTask({ projectId: query.proyecto ?? undefined, tramoKey: query.tramo ?? undefined }, "tareas")
      }
    >
      <Plus aria-hidden="true" data-icon="inline-start" />
      Nueva tarea
    </Button>
  ) : null;
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
    view = <TareasTablero query={query} header={header} filters={filters} empty={empty} />;
  } else if (query.vista === "lista") {
    view = <TareasLista query={query} header={header} filters={filters} empty={empty} />;
  } else {
    // The facets count every filter but tramo: the selected tramo's count is the view's.
    const viewCount = query.tramo ? (facets.byTramo[query.tramo] ?? 0) : facets.total;
    view = (
      <TareasCalendarioView
        header={header}
        filters={filters}
        empty={filtered && ready && viewCount === 0 ? empty : null}
        tramos={tramos}
      />
    );
  }

  return (
    <>
      {/* One layout per style (ADR 0004): Visual is the team board, Esencial the cards per project. */}
      <PageStyleLayout
        visual={() => (
          <TareasVisual
            query={query}
            facets={facets}
            tramos={tramos}
            actions={actions}
            search={search}
            onSearch={setSearch}
            onQuery={replaceQuery}
            empty={empty}
          />
        )}
        esencial={() => <TareasEsencial />}
        analitico={() =>
          // Analítico is the tables by project and tramo; an old `?vista=calendario` link keeps its calendar.
          query.vista === "calendario" ? (
            view
          ) : (
            <TareasAnalitico
              query={query}
              facets={facets}
              tramos={tramos}
              staff={staff}
              actions={actions}
              search={search}
              onSearch={setSearch}
              onQuery={replaceQuery}
              empty={empty}
              canCreate={canCreate}
            />
          )
        }
      />
      {/* `?tarea=<id>` opens the task sheet over the view, which stays mounted. */}
      <TaskSheetRoute />
    </>
  );
}

/**
 * Calendario has no `ListPage` spec: the shell renders the header (Estilo
 * switch included, as `ListPage` does for the other views) and the filters
 * above `TareasCalendario`, which reads its mode, date and filters from the
 * URL and its rows from `tareas.calendar`.
 */
function TareasCalendarioView({
  header,
  filters,
  empty,
  tramos,
}: {
  header: PageHeaderProps;
  filters: ReactNode;
  empty: EmptyStateProps | null;
  tramos: WorkflowRef[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader {...header} />
      {filters}
      {empty ? (
        <EmptyState {...empty} />
      ) : (
        <TareasCalendario tramos={tramos} />
      )}
    </div>
  );
}
