"use client";

import { DayAlertBanners } from "./DayAlertBanner";
import { DayLoadTable } from "./DayLoadTable";
import { ProposalOverlay } from "./ProposalOverlay";
import { useCalendarioOverlay } from "./overlay-context";
import { dayLoadLine, loadSubtitle } from "@/lib/calendario/alerts";
import type { CalendarioRange } from "@/lib/types/calendario";

/**
 * Above the calendar body, per Estilo (FE §7.1, §7.4): the day alert banners (max 2) and, while a
 * proposal is open, its legend. Esencial adds one line per overloaded day, Analítico the
 * "Carga del día" table and the greyed originals / dashed entries list.
 */
export function CalendarioAlerts({ range, variant }: { range: CalendarioRange; variant: "visual" | "esencial" | "analitico" }) {
  const overlay = useCalendarioOverlay();
  const loadDays = range.days.filter((d) => d.hours !== null && d.workday !== null && d.loadLabel !== null);
  const after = Object.fromEntries(loadDays.flatMap((d) => (overlay.afterHours(d.date) === null ? [] : [[d.date, overlay.afterHours(d.date) as number]])));
  const workday = loadDays[0]?.workday ?? null;
  const showTable = variant === "analitico" && loadDays.length > 0 && range.to !== range.from && loadDays.length <= 7;
  return (
    <div data-slot="calendario-alerts" className="mb-4 flex flex-col gap-3 empty:hidden">
      <DayAlertBanners alerts={overlay.alerts} pendingKey={overlay.pendingKey} onAction={overlay.onAlert} />
      {variant === "esencial" && overlay.alerts.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {loadDays
            .filter((d) => d.loadLabel === "sobrecargado")
            .map((d) => (
              <li key={d.date}>{dayLoadLine(d)}</li>
            ))}
        </ul>
      ) : null}
      {overlay.proposal ? (
        variant === "visual" ? (
          <ProposalOverlay proposal={overlay.proposal} range={range} checked={overlay.checked}>
            {() => null}
          </ProposalOverlay>
        ) : (
          <ProposalOverlay proposal={overlay.proposal} range={range} checked={overlay.checked} />
        )
      ) : null}
      {showTable ? (
        <section aria-label="Carga del día" className="flex flex-col gap-2">
          {workday !== null ? <p className="text-xs text-muted-foreground">{loadSubtitle(range.from, workday)}</p> : null}
          <DayLoadTable days={loadDays} afterByDate={after} />
        </section>
      ) : null}
    </div>
  );
}
