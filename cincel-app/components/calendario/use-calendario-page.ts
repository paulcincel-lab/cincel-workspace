"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { withCurrentEstilo } from "@/components/tareas/use-tareas-page";
import { calendarioHref, parseCalendarioQuery, rangeInputOf } from "@/lib/calendario/url-state";
import { calendarioRangeOptions } from "@/lib/query/options/calendario";
import { useHideCompletedPreference } from "@/lib/stores/appearance-store";
import type { CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

/**
 * The Calendario query of the URL (FE §2.4). A URL without `?ocultar=` follows
 * the viewer's "Ocultar completadas" preference. The default `vista` per Estilo
 * (F3) is applied by Phase 1.
 */
export function useCalendarioQuery(): CalendarioQuery {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [hideCompleted] = useHideCompletedPreference();
  return useMemo(() => parseCalendarioQuery(search, { ocultarCompletadas: hideCompleted }), [search, hideCompleted]);
}

/** Filters and detail write the URL without a server render; `?estilo=` stays. */
export function replaceCalendarioUrl(q: CalendarioQuery): void {
  window.history.replaceState(null, "", withCurrentEstilo(calendarioHref(q), window.location.search));
}

/** Range navigation adds a history entry, so Back walks through ranges. */
export function pushCalendarioUrl(q: CalendarioQuery): void {
  window.history.pushState(null, "", withCurrentEstilo(calendarioHref(q), window.location.search));
}

/** The range of the query (`qk.calendario.range`). */
export function useCalendarioRange(query: CalendarioQuery): { range: CalendarioRange | undefined; isPending: boolean } {
  const { data, isPending } = useQuery(calendarioRangeOptions(rangeInputOf(query)));
  return { range: data, isPending };
}
