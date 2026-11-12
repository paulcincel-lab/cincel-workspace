"use client";

import { DayLoadMeter } from "./DayLoadMeter";
import { PROPOSAL_DASHED_CLASS } from "./ProposalOverlay";
import { useCalendarioOverlay } from "./overlay-context";
import { labelOf } from "@/lib/calendario/alerts";
import type { CalDay } from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

/**
 * What a day cell adds to its items: the proposed entries of the open proposal (dashed, with their
 * text tag) and the day's load meter (FE §7.1, §7.4). Renders nothing without either.
 */
export function DayCellExtras({ day, compact = false, meter = true }: { day: CalDay | undefined; compact?: boolean; meter?: boolean }) {
  const overlay = useCalendarioOverlay();
  const date = day?.date;
  const entries = date ? (overlay.entriesByDate.get(date) ?? []) : [];
  const showMeter = meter && day && day.hours !== null && day.workday !== null && day.loadLabel !== null && (day.hours > 0 || overlay.afterHours(day.date) !== null);
  const after = day ? overlay.afterHours(day.date) : null;
  return (
    <>
      {entries.map((entry) => (
        <div key={entry.changeId} data-slot="proposal-item" className={cn("flex min-w-0 flex-col rounded-md px-1.5 py-1 text-xs", PROPOSAL_DASHED_CLASS)}>
          <span className="truncate">{entry.title}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{entry.tag}</span>
        </div>
      ))}
      {showMeter && day ? (
        <DayLoadMeter
          hours={day.hours ?? 0}
          workday={day.workday ?? 0}
          label={after !== null ? labelOf(after, day.workday ?? 0) : (day.loadLabel ?? "libre")}
          afterHours={after}
          compact={compact}
        />
      ) : null}
    </>
  );
}
