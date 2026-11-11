import type { CalItem, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type CalendarDayTimelineProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  onOpen?(id: string): void;
  onMove?(item: CalItem, date: string): void;
};

/** Visual piece of the Día vista. Markup belongs to Phase 1. */
export function CalendarDayTimeline({ range }: CalendarDayTimelineProps) {
  return <CalendarioStubSection label="Día" titles={range.items.map((item) => item.title)} />;
}
