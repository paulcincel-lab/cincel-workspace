import type { CalItem, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type CalendarWeekColumnsProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  onOpen?(id: string): void;
  onMove?(item: CalItem, date: string): void;
};

/** Visual piece of the Semana vista. Markup belongs to Phase 1. */
export function CalendarWeekColumns({ range }: CalendarWeekColumnsProps) {
  return <CalendarioStubSection label="Semana" titles={range.items.map((item) => item.title)} />;
}
