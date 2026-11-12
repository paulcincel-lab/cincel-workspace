"use client";

import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { BarraParaPedir } from "@/components/widgets/calendario/BarraParaPedir";
import { CalendarioAnalitico } from "@/components/widgets/calendario/CalendarioAnalitico";
import { CalendarioEsencial } from "@/components/widgets/calendario/CalendarioEsencial";
import { CalendarioAlerts } from "@/components/widgets/calendario/CalendarioAlerts";
import { MeetingsList } from "@/components/widgets/calendario/MeetingsList";
import { CalendarioVisual } from "@/components/widgets/calendario/CalendarioVisual";
import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { rangeOf } from "@/lib/calendario/range";
import type { CalEventItem, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

import { barraExamples, recentProjectName } from "./barra-examples";
import { CalendarioChrome } from "./CalendarioChrome";
import { CalendarioOverlayProvider } from "./CalendarioOverlayProvider";
import { EventDetailHost } from "./EventDetailHost";
import { GoogleConnectBanner } from "./GoogleConnectBanner";
import { NewMeetingHost } from "./NewMeetingDialog";
import { PlanWeekSection } from "./PlanWeekSection";
import { ResumenSection } from "./ResumenSection";
import { useCalendarioAssistantContext } from "./use-calendario-assistant-context";
import { replaceCalendarioUrl, useCalendarioQuery, useCalendarioRange } from "./use-calendario-page";
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

  // Items of every view and Estilo open their detail through `?evento=` (FE §5).
  const openItem = (id: string) => replaceCalendarioUrl({ ...query, evento: id });

  const aboveBody = (
    <>
      <NewMeetingHost />
      {range ? <GoogleConnectBanner google={range.google} /> : null}
      <BarraParaPedir context={assistantContext} examples={barraExamples(recentProjectName(current))} />
      <ResumenSection query={query} />
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
      <CalendarioOverlayProvider range={current}>
        <PageStyleLayout
          visual={() => (
            <>
              <CalendarioAlerts range={current} variant="visual" />
              <CalendarioVisual range={current} query={query} onOpen={openItem} />
            </>
          )}
          esencial={() => (
            <>
              <CalendarioAlerts range={current} variant="esencial" />
              <CalendarioEsencial range={current} query={query} onOpen={openItem} onComplete={completeTask} />
            </>
          )}
          analitico={() => (
            <>
              <CalendarioAlerts range={current} variant="analitico" />
              <CalendarioAnalitico range={current} query={query} onOpen={openItem} />
            </>
          )}
        />
        <MeetingsSection range={current} query={query} onOpen={openItem} />
        <PlanWeekSection query={query} />
        <EventDetailHost />
      </CalendarioOverlayProvider>
    </CalendarioChrome>
  );
}

/** "Reuniones" (FE §7.6): under the Analítico table; in Visual and Esencial when Mostrar is Reuniones. */
function MeetingsSection({ range, query, onOpen }: { range: CalendarioRange; query: CalendarioQuery; onOpen(id: string): void }) {
  const meetings = range.items.filter((i): i is CalEventItem => i.kind === "event");
  if (meetings.length === 0) return null;
  const list = <MeetingsList meetings={meetings} onOpen={onOpen} today={range.today} />;
  const onlyMeetings = query.filters.mostrar === "reuniones";
  return <PageStyleLayout visual={() => (onlyMeetings ? list : null)} esencial={() => (onlyMeetings ? list : null)} analitico={() => list} />;
}
