"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { tareasListFiltersOf, tareasPageKeyInputOf, tareasPageOptions } from "@/lib/query/options/tareas";
import type { TareasListFilters } from "@/lib/query/keys";
import { DEFAULT_TAREAS_QUERY, parseTareasQuery, type TareasQuery } from "@/lib/tareas/query";
import { useStyle } from "@/components/shell/StyleProvider";

/**
 * The `/tareas` query from the URL. Filters write it with
 * `history.replaceState` (`replaceTareasUrl`), which Next keeps in sync with
 * `useSearchParams`, so a filter change re-renders here without a server
 * render.
 */
export function useTareasQuery(): TareasQuery {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  return useMemo(() => parseTareasQuery(new URLSearchParams(search)), [search]);
}

/** The filters of a query, stable while their values stay the same. */
export function useTareasFilters(query: TareasQuery): TareasListFilters {
  const { tramo, proyecto, responsable, estado, q, mostrar } = query;
  return useMemo(
    () => tareasListFiltersOf({ ...DEFAULT_TAREAS_QUERY, tramo, proyecto, responsable, estado, q, mostrar }),
    [tramo, proyecto, responsable, estado, q, mostrar],
  );
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

/** Writes a Tareas URL without a server render (filters, chips, search). */
export function replaceTareasUrl(href: string): void {
  window.history.replaceState(null, "", href);
}

/** Adds a Tareas URL to the history without a server render (the view switch). */
export function pushTareasUrl(href: string): void {
  window.history.pushState(null, "", href);
}
