"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";

import { pushCalendarioUrl } from "@/components/calendario/use-calendario-page";
import { addDays } from "@/lib/time-tracking/local-time";
import { addMonths, weekBounds } from "@/lib/calendario/move";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

/**
 * Roving focus of the Mes and Semana grids (FE §11): arrows move by day (and
 * by week in Mes), Home/End go to the week's ends, PageUp/PageDown change the
 * month (Mes) or the week (Semana) through the URL, Enter opens Día. The
 * cursor is `selectedDate` of the UI store, else the URL's `fecha`.
 */
export function useGridNav(range: CalendarioRange, query: CalendarioQuery) {
  const selected = useCalendarioUi((s) => s.selectedDate);
  const setSelected = useCalendarioUi((s) => s.setSelectedDate);
  const containerRef = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null);

  const inRange = (date: string | null | undefined): date is string => Boolean(date) && date! >= range.from && date! <= range.to;
  const cursor = inRange(selected) ? selected : inRange(query.fecha) ? query.fecha : range.from;

  useEffect(() => {
    if (pending.current !== cursor) return;
    pending.current = null;
    containerRef.current?.querySelector<HTMLElement>(`[data-cell-date="${cursor}"]`)?.focus();
  });

  const goTo = useCallback(
    (date: string) => {
      pending.current = date;
      setSelected(date);
      if (date < range.from || date > range.to) pushCalendarioUrl({ ...query, fecha: date });
    },
    [query, range.from, range.to, setSelected],
  );

  const openDay = useCallback((date: string) => pushCalendarioUrl({ ...query, vista: "dia", fecha: date }), [query]);

  const onCellKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, date: string) => {
      // Keys typed inside a chip or button belong to it.
      if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
      const mes = query.vista === "mes";
      const bounds = weekBounds(date);
      let next: string | null = null;
      switch (event.key) {
        case "ArrowLeft":
          next = addDays(date, -1);
          break;
        case "ArrowRight":
          next = addDays(date, 1);
          break;
        case "ArrowUp":
          next = mes ? addDays(date, -7) : null;
          break;
        case "ArrowDown":
          next = mes ? addDays(date, 7) : null;
          break;
        case "Home":
          next = bounds.start;
          break;
        case "End":
          next = bounds.end;
          break;
        case "PageUp":
          next = mes ? addMonths(date, -1) : addDays(date, -7);
          break;
        case "PageDown":
          next = mes ? addMonths(date, 1) : addDays(date, 7);
          break;
        case "Enter":
        case " ":
          event.preventDefault();
          openDay(date);
          return;
        default:
          return;
      }
      if (!next) return;
      event.preventDefault();
      goTo(next);
    },
    [goTo, openDay, query.vista],
  );

  return { containerRef, cursor, onCellKeyDown, goTo, openDay };
}
