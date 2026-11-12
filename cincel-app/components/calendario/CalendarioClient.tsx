"use client";

import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { BarraParaPedir } from "@/components/widgets/calendario/BarraParaPedir";
import { CalendarioAnalitico } from "@/components/widgets/calendario/CalendarioAnalitico";
import { CalendarioEsencial } from "@/components/widgets/calendario/CalendarioEsencial";
import { CalendarioVisual } from "@/components/widgets/calendario/CalendarioVisual";
import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { rangeOf } from "@/lib/calendario/range";

import { barraExamples, recentProjectName } from "./barra-examples";
import { CalendarioChrome } from "./CalendarioChrome";
import { GoogleConnectBanner } from "./GoogleConnectBanner";
import { NewMeetingHost } from "./NewMeetingDialog";
import { PlanWeekSection } from "./PlanWeekSection";
import { useCalendarioAssistantContext } from "./use-calendario-assistant-context";
import { useCalendarioQuery, useCalendarioRange } from "./use-calendario-page";
import { useCompleteCalendarioTask } from "./use-complete-calendario-task";
import { useGoogleRefresh } from "./use-google-refresh";

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
  // Once per session when the cache is stale (FE §6.3); only with a loaded range, so the empty fallback never triggers it.
  const assistantContext = useCalendarioAssistantContext();
  const google = useGoogleRefresh(range ? range.google : { connected: false, eventsGrant: false, syncedAt: null, error: null });

  const aboveBody = (
    <>
      <NewMeetingHost />
      {range ? <GoogleConnectBanner google={range.google} /> : null}
      <BarraParaPedir context={assistantContext} examples={barraExamples(recentProjectName(current))} />
    </>
  );

  return (
    <CalendarioChrome
      query={query}
      status={status}
      aboveBody={aboveBody}
      onRefresh={range?.google.connected ? google.refresh : undefined}
      refreshing={google.refreshing}
    >
      <PageStyleLayout
        visual={() => <CalendarioVisual range={current} query={query} />}
        esencial={() => <CalendarioEsencial range={current} query={query} onComplete={completeTask} />}
        analitico={() => <CalendarioAnalitico range={current} query={query} />}
      />
      <PlanWeekSection query={query} />
    </CalendarioChrome>
  );
}
