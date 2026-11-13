"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";

import { CalendarioHeader } from "@/components/calendario/CalendarioHeader";
import { CalendarioToolbar } from "@/components/calendario/CalendarioToolbar";
import { CALENDARIO_PAGE_COPY as copy } from "@/components/calendario/page-copy";
import {
  useCalendarioDefaults,
  useCalendarioNavigation,
  useCanViewTeamCalendar,
  type useCalendarioRange,
} from "@/components/calendario/use-calendario-page";
import { EmptyState } from "@/components/shell/EmptyState";
import { ErrorState } from "@/components/shell/ErrorState";
import { Progress } from "@/components/ui/shadcn/progress";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { CalendarioFilters } from "@/components/widgets/calendario/CalendarioFilters";
import { CalendarioSkeleton } from "@/components/widgets/route-skeletons";
import { hasActiveCalendarioFilters } from "@/lib/calendario/filters";
import { rangeLabel } from "@/lib/calendario/labels";
import { catalogProjectOptionsOptions, catalogEtapasOptions } from "@/lib/query/options/catalog";
import type { CalKpis, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

const NO_KPIS: CalKpis = { tasks: 0, meetings: 0, meetingHours: 0, overdue: 0, overduePct: 0, unassigned: 0 };
const NO_ETAPAS: never[] = [];

type RangeStatus = ReturnType<typeof useCalendarioRange>;

/**
 * The page anatomy of /calendario around the body (FE §3): header, toolbar,
 * filters of the Estilo, then the body, or the page state that replaces it
 * (first load, error with "Reintentar", empty because of filters with "Quitar
 * filtros"). While another range loads the previous one stays, dimmed, under a
 * top progress line (FE §12).
 */
export function CalendarioChrome({
  query,
  status,
  aboveBody,
  onRefresh,
  refreshing,
  children,
}: {
  query: CalendarioQuery;
  status: RangeStatus;
  /** Rendered between the filters and the body: new meeting host, Google banner, Barra para pedir. */
  aboveBody?: ReactNode;
  onRefresh?(): void;
  refreshing?: boolean;
  children: ReactNode;
}): ReactNode {
  const { range, isFetching, isPlaceholderData, isError, refetch } = status;
  const defaults = useCalendarioDefaults();
  const nav = useCalendarioNavigation(query);
  const canViewTeam = useCanViewTeamCalendar();
  const projects = useQuery(catalogProjectOptionsOptions()).data;
  const etapas = useQuery(catalogEtapasOptions()).data ?? NO_ETAPAS;
  const projectOptions = useMemo(() => (projects ?? []).map((p) => ({ id: p.id, name: p.name })), [projects]);

  const today = range?.today ?? defaults.today;
  const changingRange = isFetching && isPlaceholderData;
  const filtered = hasActiveCalendarioFilters(query.filters);

  return (
    <>
      <CalendarioHeader query={query} today={today} kpis={range?.kpis ?? NO_KPIS} />
      <CalendarioToolbar
        vista={query.vista}
        rangeLabel={rangeLabel(query.vista, query.fecha)}
        onVista={nav.setVista}
        onPrevious={nav.previous}
        onNext={nav.next}
        onToday={nav.today}
        todayDisabled={query.fecha === today}
        onPrefetch={nav.prefetchAdjacent}
        onPrefetchCancel={nav.cancelPrefetch}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
      <CalendarioFilters
        filters={query.filters}
        vista={query.vista}
        canViewTeam={canViewTeam}
        projects={projectOptions}
        etapas={etapas}
        onChange={nav.patchFilters}
      />
      {aboveBody}
      {changingRange ? (
        <Progress value={null} aria-label={copy.loadingRange} className="mb-2" trackClassName="h-0.5 rounded-none" />
      ) : null}
      <PageBody range={range} isError={isError} filtered={filtered} busy={changingRange} onRetry={refetch} onClear={nav.clearFilters}>
        {children}
      </PageBody>
    </>
  );
}

function PageBody({
  range,
  isError,
  filtered,
  busy,
  onRetry,
  onClear,
  children,
}: {
  range: CalendarioRange | undefined;
  isError: boolean;
  filtered: boolean;
  busy: boolean;
  onRetry(): void;
  onClear(): void;
  children: ReactNode;
}): ReactNode {
  if (!range) {
    if (isError) return <ErrorState title={copy.loadError} onRetry={onRetry} />;
    return (
      <PageStyleLayout
        visual={() => <CalendarioSkeleton variant="visual" />}
        esencial={() => <CalendarioSkeleton variant="esencial" />}
        analitico={() => <CalendarioSkeleton variant="analitico" />}
      />
    );
  }
  if (range.items.length === 0 && filtered) {
    return <EmptyState title={copy.emptyFilters} action={{ label: copy.clearFilters, onClick: onClear }} />;
  }
  return (
    <div data-slot="calendario-body" aria-busy={busy || undefined} className={busy ? "opacity-60 transition-opacity motion-reduce:transition-none" : undefined}>
      {children}
    </div>
  );
}
