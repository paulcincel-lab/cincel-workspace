"use client";

import { PageHeader } from "@/components/widgets/PageHeader";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { CalendarioAnalitico } from "@/components/widgets/calendario/CalendarioAnalitico";
import { CalendarioEsencial } from "@/components/widgets/calendario/CalendarioEsencial";
import { CalendarioVisual } from "@/components/widgets/calendario/CalendarioVisual";
import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { rangeOf } from "@/lib/calendario/range";

import { PlanWeekSection } from "./PlanWeekSection";
import { useCalendarioQuery, useCalendarioRange } from "./use-calendario-page";

/**
 * /calendario client (FE §2.1, §3). Takes no data: the query comes from the
 * URL and the range from `qk.calendario.range`. Renders the header and the
 * layout of the resolved Estilo; the toolbar, filters and the rest of the page
 * anatomy belong to Phase 1.
 */
export function CalendarioClient() {
  const query = useCalendarioQuery();
  const { range } = useCalendarioRange(query);
  const current = range ?? emptyCalendarioRange(rangeOf(query.vista, query.fecha), query.fecha);

  return (
    <>
      <PageHeader title="Calendario" />
      <PageStyleLayout
        visual={() => <CalendarioVisual range={current} query={query} />}
        esencial={() => <CalendarioEsencial range={current} query={query} />}
        analitico={() => <CalendarioAnalitico range={current} query={query} />}
      />
      <PlanWeekSection query={query} />
    </>
  );
}
