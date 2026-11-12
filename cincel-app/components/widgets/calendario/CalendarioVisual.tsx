"use client";

import type { CalItem, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

import { CalendarDayTimeline } from "./CalendarDayTimeline";
import { CalendarMonthGrid } from "./CalendarMonthGrid";
import { CalendarWeekColumns } from "./CalendarWeekColumns";

export type CalendarioVisualProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  onOpen?(id: string): void;
  onMove?(item: CalItem, date: string): void;
};

/** Visual layout of /calendario: the Mes and Semana grids; Día is the timeline (#1063). */
export function CalendarioVisual({ range, query, onOpen, onMove }: CalendarioVisualProps) {
  if (query.vista === "mes") return <CalendarMonthGrid range={range} query={query} onOpen={onOpen} onMove={onMove} />;
  if (query.vista === "semana") return <CalendarWeekColumns range={range} query={query} onOpen={onOpen} onMove={onMove} />;
  return <CalendarDayTimeline range={range} query={query} onOpen={onOpen} onMove={onMove} />;
}
