"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

import { useHideCompletedPreference } from "@/lib/stores/appearance-store";
import { TAREAS_COMPLETADAS_PARAM, parseCompletadasParam } from "@/lib/tareas/query";

/**
 * The URL of `href` with `?completadas=0` set (hide) or removed (show); the
 * other params stay. Pure.
 */
export function withCompletadasParam(href: string, hide: boolean): string {
  const url = new URL(href, "http://x");
  if (hide) url.searchParams.set(TAREAS_COMPLETADAS_PARAM, "0");
  else url.searchParams.delete(TAREAS_COMPLETADAS_PARAM);
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

/**
 * The URL of `href` for Mi espacio, where completed tasks are hidden by
 * default: `?completadas=1` set (show) or removed (hide). Pure.
 */
export function withMiEspacioCompletadasParam(href: string, hide: boolean): string {
  const url = new URL(href, "http://x");
  if (hide) url.searchParams.delete(TAREAS_COMPLETADAS_PARAM);
  else url.searchParams.set(TAREAS_COMPLETADAS_PARAM, "1");
  const search = url.searchParams.toString();
  return `${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
}

function replaceUrl(next: (href: string) => string): void {
  if (typeof window === "undefined") return;
  const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", next(href));
}

/**
 * "Ocultar completadas" for the task tables outside `/tareas` (#1039): the
 * project Tareas tab, Resumen "Tareas por tramo" and Mi espacio. On when the
 * URL says `?completadas=0`, else the viewer's preference. The setter saves
 * the preference and writes the URL with `history.replaceState` (no server
 * render), so a link keeps it.
 *
 * `defaultHidden` (Mi espacio): on unless the URL says `?completadas=1`, as
 * Mi espacio always listed open work only; the switch there writes only the
 * URL, so the saved preference of the other tables doesn't change.
 */
export function useHideCompletedTasks({ defaultHidden = false }: { defaultHidden?: boolean } = {}): [
  boolean,
  (hide: boolean) => void,
] {
  const searchParams = useSearchParams();
  const [preference, setPreference] = useHideCompletedPreference();
  const param = searchParams?.get(TAREAS_COMPLETADAS_PARAM) ?? null;
  const hidden = !parseCompletadasParam(param, defaultHidden ? false : !preference);
  const setHidden = useCallback(
    (hide: boolean) => {
      if (defaultHidden) {
        replaceUrl((href) => withMiEspacioCompletadasParam(href, hide));
        return;
      }
      setPreference(hide);
      replaceUrl((href) => withCompletadasParam(href, hide));
    },
    [defaultHidden, setPreference],
  );
  return [hidden, setHidden];
}
