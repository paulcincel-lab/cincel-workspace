"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { tareasListFiltersOf, tareasPageKeyInputOf, tareasPageOptions } from "@/lib/query/options/tareas";
import type { TareasListFilters } from "@/lib/query/keys";
import { DEFAULT_TAREAS_QUERY, parseTareasQuery, type TareasQuery } from "@/lib/tareas/query";
import type { TaskSort } from "@/lib/tareas/sort";
import { useStyle } from "@/components/shell/StyleProvider";
import { useHideCompletedPreference } from "@/lib/stores/appearance-store";
import { ESTILO_PARAM } from "@/lib/ui/style-override";

/**
 * The `/tareas` query from the URL. Filters write it with
 * `history.replaceState` (`replaceTareasUrl`), which Next keeps in sync with
 * `useSearchParams`, so a filter change re-renders here without a server
 * render.
 */
export function useTareasQuery(): TareasQuery {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  // A URL without `?completadas=` follows the viewer's "Ocultar completadas" preference.
  const [hideCompleted] = useHideCompletedPreference();
  return useMemo(
    () => parseTareasQuery(new URLSearchParams(search), { completadas: !hideCompleted }),
    [search, hideCompleted],
  );
}

/** The filters of a query, stable while their values stay the same. */
export function useTareasFilters(query: TareasQuery): TareasListFilters {
  const { etapa, proyecto, responsable, estado, q, mostrar, completadas, apoyo } = query;
  // The Proyecto multi-select (#1045) by value: a new array with the same ids keeps the filters.
  const proyectosKey = (query.proyectos ?? []).join(",");
  return useMemo(
    () =>
      tareasListFiltersOf({
        ...DEFAULT_TAREAS_QUERY,
        etapa,
        proyecto,
        proyectos: proyectosKey ? proyectosKey.split(",") : [],
        responsable,
        estado,
        q,
        mostrar,
        completadas,
        apoyo,
      }),
    [etapa, proyecto, proyectosKey, responsable, estado, q, mostrar, completadas, apoyo],
  );
}

/** The `?orden=` sort of a query (#1044), stable while its values stay the same; null for the default. */
export function useTareasSort(query: TareasQuery): TaskSort | null {
  const orderBy = query.orden?.orderBy;
  const orderDir = query.orden?.orderDir ?? "asc";
  return useMemo(() => (orderBy ? { orderBy, orderDir } : null), [orderBy, orderDir]);
}

/**
 * The layout's bundle (`qk.tareas.page(q)`, keyed by the current style, as
 * the server prefetched it), shared by every component of the screen: one
 * observer per component, one request per key (keys are hashed, so a new
 * input object for the same query is the same query).
 */
export function useTareasPage(query: TareasQuery) {
  const { style } = useStyle();
  return useQuery(tareasPageOptions(tareasPageKeyInputOf(query, style)));
}

/**
 * True once this query's bundle is in, so the keys it seeds
 * (`tareas.facets/board/list(f)`) are written. The views enable their own
 * queries on it: a filter change then sends one request (the bundle), never
 * a second one per view.
 */
export function useTareasPageReady(query: TareasQuery): boolean {
  const page = useTareasPage(query);
  return page.isSuccess && !page.isPlaceholderData;
}

/**
 * `href` with the current URL's `?estilo=` when it names none, so a filter
 * change keeps the style the page was opened with. Pure.
 */
export function withCurrentEstilo(href: string, currentSearch: string): string {
  const estilo = new URLSearchParams(currentSearch).get(ESTILO_PARAM);
  if (!estilo) return href;
  const url = new URL(href, "http://x");
  if (url.searchParams.has(ESTILO_PARAM)) return href;
  url.searchParams.set(ESTILO_PARAM, estilo);
  return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}

/** Writes a Tareas URL without a server render (filters, chips, search); `?estilo=` stays. */
export function replaceTareasUrl(href: string): void {
  window.history.replaceState(null, "", withCurrentEstilo(href, window.location.search));
}

/** Adds a Tareas URL to the history without a server render (the view switch). */
export function pushTareasUrl(href: string): void {
  window.history.pushState(null, "", href);
}
