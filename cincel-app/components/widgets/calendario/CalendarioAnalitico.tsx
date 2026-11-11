import type { InfiniteData } from "@tanstack/react-query";

import type { CalendarioListPage, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type CalendarioAnaliticoProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  list?: InfiniteData<CalendarioListPage, string | null>;
  onOpen?(id: string): void;
};

/** Analítico layout of /calendario. Markup belongs to Phase 1. */
export function CalendarioAnalitico({ range, list }: CalendarioAnaliticoProps) {
  const rows = list ? list.pages.flatMap((page) => page.rows) : range.items;
  return <CalendarioStubSection label="Calendario" titles={rows.map((item) => item.title)} />;
}
