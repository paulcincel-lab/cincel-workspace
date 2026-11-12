"use client";

import { PageHeader } from "@/components/widgets/PageHeader";
import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { BarraParaPedir } from "@/components/widgets/calendario/BarraParaPedir";
import { CalendarioAnalitico } from "@/components/widgets/calendario/CalendarioAnalitico";
import { CalendarioEsencial } from "@/components/widgets/calendario/CalendarioEsencial";
import { CalendarioVisual } from "@/components/widgets/calendario/CalendarioVisual";
import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { rangeOf } from "@/lib/calendario/range";

import { barraExamples, recentProjectName } from "./barra-examples";
import { GoogleConnectBanner } from "./GoogleConnectBanner";
import { NewMeetingHost } from "./NewMeetingDialog";
import { useCalendarioAssistantContext } from "./use-calendario-assistant-context";
import { useCalendarioQuery, useCalendarioRange } from "./use-calendario-page";
import { useGoogleRefresh } from "./use-google-refresh";

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
  // Once per session when the cache is stale (FE §6.3); only with a loaded range, so the empty fallback never triggers it.
  const assistantContext = useCalendarioAssistantContext();
  useGoogleRefresh(range ? range.google : { connected: false, eventsGrant: false, syncedAt: null, error: null });

  return (
    <>
      <PageHeader title="Calendario" />
      <NewMeetingHost />
      {range ? <GoogleConnectBanner google={range.google} /> : null}
      <BarraParaPedir context={assistantContext} examples={barraExamples(recentProjectName(current))} />
      <PageStyleLayout
        visual={() => <CalendarioVisual range={current} query={query} />}
        esencial={() => <CalendarioEsencial range={current} query={query} />}
        analitico={() => <CalendarioAnalitico range={current} query={query} />}
      />
    </>
  );
}
