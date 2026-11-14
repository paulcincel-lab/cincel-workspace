"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { useUrlSearch } from "@/components/mejoras/use-url-search";
import { KpiStrip, type KpiStripItem } from "@/components/widgets/KpiStrip";
import { MejorasAnalitico } from "@/components/widgets/mejoras/MejorasAnalitico";
import { MejorasEsencial } from "@/components/widgets/mejoras/MejorasEsencial";
import { MejorasVisual } from "@/components/widgets/mejoras/MejorasVisual";
import { TicketDetailDrawer } from "@/components/widgets/mejoras/TicketDetailDrawer";
import { PageHeader } from "@/components/widgets/PageHeader";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { mejorasCountsOptions } from "@/lib/query/options/soporte";
import { formatFirstResponse, inProgressCount, mejorasFilterParams, parseMejorasFilters } from "@/lib/soporte/mejoras-triage";
import { readParam } from "@/lib/soporte/mejoras-url";
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

const FILTER_PARAM_NAMES = ["estado", "tipo", "area", "prioridad", "asignado", "autor", "q"] as const;

/**
 * `/mejoras` (frames `Mejoras-Visual`, `Mejoras-Esencial`, `Mejoras-Analitico`):
 * the header with the four stats, the style's view through `PageStyleLayout`
 * and the detail drawer (`?solicitud=SOL-0001`). The table filters live in the
 * URL (`estado`, `tipo`, `area`, `prioridad`, `asignado`, `autor`, `q`).
 */
export function MejorasClient() {
  const { data: counts, isPending } = useQuery(mejorasCountsOptions());
  const { search, update, dismiss } = useUrlSearch();
  const filters = useMemo(() => parseMejorasFilters(new URLSearchParams(search)), [search]);
  const code = readParam(search, SOLICITUD_PARAM);

  const onFiltersChange = useCallback(
    (next: TicketFilters) => {
      const written = mejorasFilterParams(next);
      update((params) => {
        for (const name of FILTER_PARAM_NAMES) params.delete(name);
        written.forEach((value, key) => params.set(key, value));
      }, "replace");
    },
    [update],
  );
  // Opening adds a history entry (Back closes the drawer); the URL stays shareable.
  const onOpen = useCallback((next: string) => update((params) => params.set(SOLICITUD_PARAM, next), "push"), [update]);
  const onClose = useCallback(() => dismiss(SOLICITUD_PARAM), [dismiss]);

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
