"use client";

import { useQuery } from "@tanstack/react-query";

import { calendarioDayRangeOptions } from "@/lib/query/options/calendario";
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
  return <DayView range={range} query={query} onOpen={onOpen} onMove={onMove} />;
}

/** Día with the configured hours (`calendario.day_start` / `day_end`, else the jornada, else 08:00-19:00). */
function DayView({ range, query, onOpen, onMove }: CalendarioVisualProps) {
  const { data } = useQuery(calendarioDayRangeOptions());
  return <CalendarDayTimeline range={range} query={query} onOpen={onOpen} onMove={onMove} dayStart={data?.start} dayEnd={data?.end} />;
}
