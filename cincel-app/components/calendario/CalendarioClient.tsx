"use client";

import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { CalendarioAnalitico } from "@/components/widgets/calendario/CalendarioAnalitico";
import { CalendarioEsencial } from "@/components/widgets/calendario/CalendarioEsencial";
import { CalendarioVisual } from "@/components/widgets/calendario/CalendarioVisual";
import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { rangeOf } from "@/lib/calendario/range";

import { CalendarioChrome } from "./CalendarioChrome";
import { useCalendarioQuery, useCalendarioRange } from "./use-calendario-page";
import { useCompleteCalendarioTask } from "./use-complete-calendario-task";

/**
 * /calendario client (FE §2.1, §3). Takes no data: the query comes from the
 * URL and the range from `qk.calendario.range`. `CalendarioChrome` renders the
 * header, toolbar, filters and page states around the layout of the resolved
 * Estilo.
 */
export function CalendarioClient() {
  const query = useCalendarioQuery();
  const status = useCalendarioRange(query);
  const { range } = status;
  const current = range ?? emptyCalendarioRange(rangeOf(query.vista, query.fecha), query.fecha);
  const completeTask = useCompleteCalendarioTask(current.items, query.filters.ocultarCompletadas);

  return (
    <CalendarioChrome query={query} status={status}>
      <PageStyleLayout
        visual={() => <CalendarioVisual range={current} query={query} />}
        esencial={() => <CalendarioEsencial range={current} query={query} onComplete={completeTask} />}
        analitico={() => <CalendarioAnalitico range={current} query={query} />}
      />
    </CalendarioChrome>
  );
}
