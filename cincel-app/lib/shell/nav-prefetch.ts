"use client";

import { useQueryClient, type FetchQueryOptions } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";

import { inicioPageOptions } from "@/lib/query/options/inicio";
import { tareasPageKeyInputOf, tareasPageOptions } from "@/lib/query/options/tareas";
import { DEFAULT_TAREAS_QUERY } from "@/lib/tareas/query";
import type { NavItemKey } from "@/lib/ui/nav";

/**
 * Hover / focus prefetch of the main pages' data (plan §4.5, decision D5):
 * only Inicio, Tareas and Mi espacio, one page-data query per hover through
 * that page's page-data action, debounced `NAV_PREFETCH_DEBOUNCE_MS` so a
 * pointer passing over the sidebar calls nothing. `prefetchQuery` skips a
 * query that is still fresh. `next/link` keeps prefetching the RSC shell.
 */
export const NAV_PREFETCH_DEBOUNCE_MS = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each page's options carry their own data type.
type AnyFetchOptions = FetchQueryOptions<any, any, any, any>;

/** The page-data query each prefetched nav item warms, with the page's default input. */
export const NAV_PREFETCH: Partial<Record<NavItemKey, () => AnyFetchOptions>> = {
  inicio: () => inicioPageOptions(),
  // The default view `/tareas` opens with (no filters).
  tareas: () => tareasPageOptions(tareasPageKeyInputOf(DEFAULT_TAREAS_QUERY)),
};

export type NavPrefetchHandlers = {
  onMouseEnter(): void;
  onMouseLeave(): void;
  onFocus(): void;
  onBlur(): void;
};

/**
 * `prefetchFor(key)`: the pointer and focus handlers for a nav link, or
 * undefined for an item without a page-data prefetch.
 */
export function useNavPrefetch(): (key: NavItemKey) => NavPrefetchHandlers | undefined {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => cancel, [cancel]);

  return useCallback(
    (key: NavItemKey) => {
      const options = NAV_PREFETCH[key];
      if (!options) return undefined;
      const schedule = () => {
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          void qc.prefetchQuery(options());
        }, NAV_PREFETCH_DEBOUNCE_MS);
      };
      return { onMouseEnter: schedule, onFocus: schedule, onMouseLeave: cancel, onBlur: cancel };
    },
    [qc, cancel],
  );
}
