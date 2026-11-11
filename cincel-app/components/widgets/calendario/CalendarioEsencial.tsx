import type { CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type CalendarioEsencialProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  onOpen?(id: string): void;
  onComplete?(taskId: string): void;
};

/** Esencial layout of /calendario. Markup belongs to Phase 1. */
export function CalendarioEsencial({ range }: CalendarioEsencialProps) {
  return <CalendarioStubSection label="Calendario" titles={range.items.map((item) => item.title)} />;
}
