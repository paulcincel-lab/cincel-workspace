"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { KpiStrip, type KpiStripItem } from "@/components/widgets/KpiStrip";
import { MejorasAnalitico } from "@/components/widgets/mejoras/MejorasAnalitico";
import { MejorasEsencial } from "@/components/widgets/mejoras/MejorasEsencial";
import { MejorasVisual } from "@/components/widgets/mejoras/MejorasVisual";
import { TicketDetailDrawer } from "@/components/widgets/mejoras/TicketDetailDrawer";
import { PageHeader } from "@/components/widgets/PageHeader";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { mejorasCountsOptions } from "@/lib/query/options/soporte";
import { formatFirstResponse, inProgressCount, mejorasFilterParams, parseMejorasFilters } from "@/lib/soporte/mejoras-triage";
import type { MejorasCounts, TicketFilters } from "@/lib/types/soporte";

export const MEJORAS_TITLE = "Mejoras";
export const MEJORAS_DESCRIPTION = "Todas las solicitudes del equipo y en qué van.";
export const MEJORAS_ANALITICO_DESCRIPTION = "Filtra, edita y cambia varias solicitudes a la vez.";
/** The URL param that opens the detail drawer (#1115). */
export const SOLICITUD_PARAM = "solicitud";

/** The four header stats from the counts. */
export function mejorasStats(counts: MejorasCounts | undefined): KpiStripItem[] {
  return [
    { key: "nuevas", label: "Nuevas", value: counts?.nuevo ?? 0 },
    { key: "en-curso", label: "En curso", value: counts ? inProgressCount(counts) : 0 },
    { key: "resueltas", label: "Resueltas este mes", value: counts?.resolvedThisMonth ?? 0 },
    { key: "primera-respuesta", label: "Tiempo a la primera respuesta", value: formatFirstResponse(counts?.firstResponseHours) },
  ];
}

/**
 * Rewrites the query of the URL with `history.replaceState` (no new history
 * entry, no server render); the App Router mirrors it into `useSearchParams`.
 * `set` keys with a value are written, the others removed.
 */
function replaceQuery(mutate: (params: URLSearchParams) => void): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  mutate(params);
  const search = params.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
}

const FILTER_PARAM_NAMES = ["estado", "tipo", "area", "prioridad", "asignado", "autor", "q"] as const;

/**
 * `/mejoras` (frames `Mejoras-Visual`, `Mejoras-Esencial`, `Mejoras-Analitico`):
 * the header with the four stats, the style's view through `PageStyleLayout`
 * and the detail drawer (`?solicitud=SOL-0001`). The table filters live in the
 * URL (`estado`, `tipo`, `area`, `prioridad`, `asignado`, `autor`, `q`).
 */
export function MejorasClient() {
  const { data: counts, isPending } = useQuery(mejorasCountsOptions());
  const searchParams = useSearchParams();
  const queryString = searchParams?.toString() ?? "";
  const filters = useMemo(() => parseMejorasFilters(new URLSearchParams(queryString)), [queryString]);
  const code = searchParams?.get(SOLICITUD_PARAM) || null;

  const onFiltersChange = useCallback((next: TicketFilters) => {
    const written = mejorasFilterParams(next);
    replaceQuery((params) => {
      for (const name of FILTER_PARAM_NAMES) params.delete(name);
      written.forEach((value, key) => params.set(key, value));
    });
  }, []);
  const onOpen = useCallback((next: string) => replaceQuery((params) => params.set(SOLICITUD_PARAM, next)), []);
  const onClose = useCallback(() => replaceQuery((params) => params.delete(SOLICITUD_PARAM)), []);

  const view = { filters, onFiltersChange, onOpen };
  const header = (description: string) => <PageHeader title={MEJORAS_TITLE} description={description} />;

  return (
    <div className="flex flex-col gap-4">
      <PageStyleLayout
        visual={() => (
          <>
            {header(MEJORAS_DESCRIPTION)}
            <KpiStrip items={mejorasStats(counts)} loading={isPending && !counts} />
            <MejorasVisual {...view} />
          </>
        )}
        esencial={() => (
          <>
            {header(MEJORAS_DESCRIPTION)}
            <KpiStrip items={mejorasStats(counts)} loading={isPending && !counts} />
            <MejorasEsencial {...view} />
          </>
        )}
        analitico={() => (
          <>
            {header(MEJORAS_ANALITICO_DESCRIPTION)}
            <KpiStrip items={mejorasStats(counts)} loading={isPending && !counts} />
            <MejorasAnalitico {...view} />
          </>
        )}
      />
      <TicketDetailDrawer code={code} onClose={onClose} />
    </div>
  );
}
