import type { CalItem, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type CalendarioVisualProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  onOpen?(id: string): void;
  onMove?(item: CalItem, date: string): void;
};

/** Visual layout of /calendario (Mes, Semana, Día). Markup belongs to Phase 1. */
export function CalendarioVisual({ range }: CalendarioVisualProps) {
  return <CalendarioStubSection label="Calendario" titles={range.items.map((item) => item.title)} />;
}
