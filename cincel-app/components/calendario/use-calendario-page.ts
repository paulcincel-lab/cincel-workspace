"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";

import { useStyle } from "@/components/shell/StyleProvider";
import { withCurrentEstilo } from "@/components/tareas/use-tareas-page";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { defaultCalVista, shiftFecha } from "@/lib/calendario/labels";
import { rangeOf } from "@/lib/calendario/range";
import {
  calendarioHref,
  normalizeCalendarioFilters,
  parseCalendarioQuery,
  rangeInputOf,
  type CalendarioQueryDefaults,
} from "@/lib/calendario/url-state";
import { calendarioRangeOptions } from "@/lib/query/options/calendario";
import { NAV_PREFETCH_DEBOUNCE_MS } from "@/lib/shell/nav-prefetch";
import { useHideCompletedPreference } from "@/lib/stores/appearance-store";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { localDate } from "@/lib/time-tracking/local-time";
import type { CalView, CalendarioFilters, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

/**
 * What a URL without params means for this viewer (FE §2.4): the vista of the
 * Estilo (F3), today in the org time zone and the "Ocultar completadas"
 * preference. The server page builds the same defaults, so both sides read
 * the same query.
 */
export function useCalendarioDefaults(): Required<Pick<CalendarioQueryDefaults, "vista" | "today" | "ocultarCompletadas">> {
  const { style } = useStyle();
  const [hideCompleted] = useHideCompletedPreference();
  const vista = defaultCalVista(style);
  // `today` is read when a URL, a style or the preference changes, so it stays stable across renders.
  return useMemo(() => ({ vista, today: localDate(new Date()), ocultarCompletadas: hideCompleted }), [vista, hideCompleted]);
}

/** The Calendario query of the URL (FE §2.4). A URL without `?ocultar=` follows the viewer's "Ocultar completadas" preference. */
export function useCalendarioQuery(): CalendarioQuery {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const defaults = useCalendarioDefaults();
  return useMemo(() => parseCalendarioQuery(search, defaults), [search, defaults]);
}

/**
 * The href a write puts in the address bar. `vista` and `ocultar` are always
 * explicit, so a shared link opens the same view whatever the Estilo and the
 * "Ocultar completadas" preference of whoever opens it; `?estilo=` stays.
 */
function writeHref(q: CalendarioQuery): string {
  const url = new URL(calendarioHref(q, { today: localDate(new Date()) }), "http://x");
  if (!url.searchParams.has("vista")) url.searchParams.set("vista", q.vista);
  if (!url.searchParams.has("ocultar")) url.searchParams.set("ocultar", q.filters.ocultarCompletadas ? "1" : "0");
  return withCurrentEstilo(`${url.pathname}?${url.searchParams.toString()}`, window.location.search);
}

/** Filters and detail write the URL without a server render; `?estilo=` stays. */
export function replaceCalendarioUrl(q: CalendarioQuery): void {
  window.history.replaceState(null, "", writeHref(q));
}

/** Range navigation adds a history entry, so Back walks through ranges. */
export function pushCalendarioUrl(q: CalendarioQuery): void {
  window.history.pushState(null, "", writeHref(q));
}

/** The range of the query (`qk.calendario.range`); the previous range stays while the next loads. */
export function useCalendarioRange(query: CalendarioQuery): {
  range: CalendarioRange | undefined;
  isPending: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
  refetch(): void;
} {
  const { data, isPending, isFetching, isPlaceholderData, isError, refetch } = useQuery(calendarioRangeOptions(rangeInputOf(query)));
  return { range: data, isPending, isFetching, isPlaceholderData, isError, refetch: () => void refetch() };
}

/** Whether the viewer may pick "Todos" (`canViewTeamCalendar`). */
export function useCanViewTeamCalendar(): boolean {
  const user = useSessionStore(selectAuthenticatedUser);
  return useMemo(() => resolveCalendarCapabilities(user).canViewTeamCalendar, [user]);
}

export type CalendarioNavigation = {
  setVista(vista: CalView): void;
  previous(): void;
  next(): void;
  today(): void;
  /** Filters write the URL in place (no history entry). */
  patchFilters(patch: Partial<CalendarioFilters>): void;
  /** Back to the defaults of every filter, "Ocultar completadas" included. */
  clearFilters(): void;
  /** Hover / focus of Anterior / Siguiente: prefetches that range once, after 100 ms. */
  prefetchAdjacent(direction: -1 | 1): void;
  cancelPrefetch(): void;
};

/** The writes of the toolbar and the filters on the URL, plus the adjacent-range prefetch (FE §9.3). */
export function useCalendarioNavigation(query: CalendarioQuery): CalendarioNavigation {
  const qc = useQueryClient();
  const defaults = useCalendarioDefaults();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPrefetch = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);
  useEffect(() => cancelPrefetch, [cancelPrefetch]);

  const go = useCallback(
    (fecha: string, vista: CalView = query.vista) => {
      cancelPrefetch();
      pushCalendarioUrl({ ...query, vista, fecha });
    },
    [query, cancelPrefetch],
  );

  const patchFilters = useCallback(
    (patch: Partial<CalendarioFilters>) => {
      replaceCalendarioUrl({ ...query, filters: normalizeCalendarioFilters({ ...query.filters, ...patch }) });
    },
    [query],
  );

  const clearFilters = useCallback(() => {
    replaceCalendarioUrl({ ...query, filters: normalizeCalendarioFilters({ ocultarCompletadas: false }) });
  }, [query]);

  const prefetchAdjacent = useCallback(
    (direction: -1 | 1) => {
      cancelPrefetch();
      timer.current = setTimeout(() => {
        timer.current = null;
        const fecha = shiftFecha(query.vista, query.fecha, direction);
        // `prefetchQuery` skips a range that is still fresh, so a second hover calls nothing.
        void qc.prefetchQuery(calendarioRangeOptions({ view: query.vista, ...rangeOf(query.vista, fecha), filters: query.filters }));
      }, NAV_PREFETCH_DEBOUNCE_MS);
    },
    [qc, query.vista, query.fecha, query.filters, cancelPrefetch],
  );

  return useMemo(
    () => ({
      setVista: (vista) => {
        if (vista !== query.vista) go(query.fecha, vista);
      },
      previous: () => go(shiftFecha(query.vista, query.fecha, -1)),
      next: () => go(shiftFecha(query.vista, query.fecha, 1)),
      today: () => go(defaults.today),
      patchFilters,
      clearFilters,
      prefetchAdjacent,
      cancelPrefetch,
    }),
    [query.vista, query.fecha, go, defaults.today, patchFilters, clearFilters, prefetchAdjacent, cancelPrefetch],
  );
}
