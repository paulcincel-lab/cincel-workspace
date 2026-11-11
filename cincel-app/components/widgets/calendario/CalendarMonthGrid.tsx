import type { CalItem, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type CalendarMonthGridProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  onOpen?(id: string): void;
  onMove?(item: CalItem, date: string): void;
};

/** Visual piece of the Mes vista. Markup belongs to Phase 1. */
export function CalendarMonthGrid({ range }: CalendarMonthGridProps) {
  return <CalendarioStubSection label="Mes" titles={range.items.map((item) => item.title)} />;
}
