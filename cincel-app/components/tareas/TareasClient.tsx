"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
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
} from "@/lib/tareas/query";
import type { WorkflowRef } from "@/lib/types/core";

import { TareasEsencial } from "./TareasEsencial";
import { TareasVisual } from "./TareasVisual";
import { TareasAnalitico } from "./TareasAnalitico";
import { TareasStartSlot, startSlotTramo } from "./TareasStartSlot";
import { TaskSheetRoute } from "./TaskSheet";
import {
  replaceTareasUrl,
  useTareasFilters,
  useTareasPage,
  useTareasPageReady,
  useTareasQuery,
} from "./use-tareas-page";

export const TAREAS_EMPTY_TITLE = "No hay tareas con estos filtros";
export const TAREAS_CLEAR_FILTERS = "Quitar filtros";

/** Pause after typing before the search box writes `q` to the URL. */
export const TAREAS_SEARCH_DEBOUNCE_MS = 300;

const NO_TRAMOS: WorkflowRef[] = [];
const NO_STAFF: TareasStaffOption[] = [];
const NO_FACETS: TareasFacets = { total: 0, byTramo: {}, projects: [] };

/**
 * /tareas client (redesign FE §3.4, §4.5; Query Migration 4a; Estilos ADR
 * 0004): the layout of the resolved style (Visual, Esencial or Analítico),
 * with "Nueva tarea", the URL-synced search and the shared empty state. It
 * takes no data: the query comes from the URL, the counts and options from
 * `tareas.facets(f)` and `tareas.page(q)`, and each layout reads its own
 * query. Filters write the URL with `history.replaceState` (no server
 * render); the key change refetches. With exactly one tramo filter, Project
 * Flow's start slot ("Listos para iniciar", "Próximos" and the Iniciar tramo
 * sheet, its own `qk.tareas.startSlot` query) sits under the header in every
 * style; `?project=X&iniciar=1` opens the sheet for X.
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

  // ── Header actions and empty state.
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

  const filtered = hasTareasFilters(query);
  const empty: EmptyStateProps = filtered
    ? {
        title: TAREAS_EMPTY_TITLE,
        action: { label: TAREAS_CLEAR_FILTERS, href: tareasHref(clearTareasFilters()) },
      }
    : { title: TAREAS_EMPTY_TITLE };

  // ── Project Flow's start slot: one per tramo, remounted when the tramo changes.
  const slotTramo = startSlotTramo(query.tramo, tramos);
  const startSlot = slotTramo ? <TareasStartSlot key={slotTramo.id} workflow={slotTramo} /> : null;

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
            startSlot={startSlot}
          />
        )}
        esencial={() => <TareasEsencial startSlot={startSlot} />}
        analitico={() => (
          // Analítico is the tables by project and tramo.
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
            startSlot={startSlot}
          />
        )}
      />
      {/* `?tarea=<id>` opens the task sheet over the view, which stays mounted. */}
      <TaskSheetRoute />
    </>
  );
}

