/**
 * Presentation helpers of the Tareas · Calendario view (redesign FE §3.4):
 * turn the `CalendarEvent`s built by `calendar-service.ts` (data logic,
 * unchanged) into the shared widget shapes (`AgendaItem`,
 * `DistributionSegment`, `RecordTableData`) and compute the visible range,
 * navigation and lowercase es-MX titles of the mes / semana / día modes.
 * Pure and client-safe.
 */
import { addDays, groupEventsByDate, startOfWeek } from "@/lib/calendar/calendar-service";
import { cachedDateTimeFormat } from "@/lib/dates/zoned-formatters";
import type { CalendarEvent } from "@/lib/types/calendar";
import type { WorkflowRef } from "@/lib/types/core";
import type { AgendaItem, DistributionSegment, RecordTableData } from "@/lib/types/widgets";

export type CalendarMode = "mes" | "semana" | "dia";

/** Event type rendered as an all-day due date ("Vence hoy", all-day row). */
export const DELIVERY_TYPE = "Fecha de entrega";

const NEUTRAL_COLOR_VAR = "var(--muted-foreground)";
const GENERIC_SERIES = ["var(--chart-4)", "var(--chart-5)"] as const;

/** `YYYY-MM-DD` of a local date (the format of `CalendarEvent.date`). */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local midnight of a `YYYY-MM-DD` key. */
export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Monday-first month grid bounds (inclusive) for the month that holds `cursor`. */
export function monthGridRange(cursor: Date): { from: Date; to: Date } {
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const from = startOfWeek(monthStart);
  const to = addDays(startOfWeek(monthEnd), 6);
  return { from: startOfDay(from), to: startOfDay(to) };
}

/**
 * Days whose events the mode renders (inclusive). Semana also covers the
 * previous week, which its Analítico summary compares against.
 */
export function visibleRange(mode: CalendarMode, cursor: Date): { from: string; to: string } {
  if (mode === "mes") {
    const { from, to } = monthGridRange(cursor);
    return { from: dayKey(from), to: dayKey(to) };
  }
  if (mode === "semana") {
    const weekStart = startOfWeek(cursor);
    return { from: dayKey(addDays(weekStart, -7)), to: dayKey(addDays(weekStart, 6)) };
  }
  const day = startOfDay(cursor);
  return { from: dayKey(day), to: dayKey(day) };
}

/**
 * Days the Calendario view loads for a mode (inclusive): the visible range
 * plus the month grid of `cursor`, which the aside's "Entregas por semana"
 * reads in every mode. At most 49 days (a six-week grid plus the previous
 * week of Semana). Moving the Día cursor inside one month keeps the range.
 */
export function calendarFetchRange(mode: CalendarMode, cursor: Date): { from: string; to: string } {
  const visible = visibleRange(mode, cursor);
  const grid = monthGridRange(cursor);
  const gridFrom = dayKey(grid.from);
  const gridTo = dayKey(grid.to);
  return {
    from: visible.from < gridFrom ? visible.from : gridFrom,
    to: visible.to > gridTo ? visible.to : gridTo,
  };
}

/** The cursor one step back (`-1`) or forward (`1`) in the mode's unit. */
export function shiftCursor(mode: CalendarMode, cursor: Date, direction: -1 | 1): Date {
  if (mode === "mes") return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1);
  if (mode === "semana") return addDays(startOfWeek(cursor), 7 * direction);
  return addDays(startOfDay(cursor), direction);
}

/** Accessible names of the prev / next buttons (FE §3.4: "Mes anterior" / "Mes siguiente"). */
export function navLabels(mode: CalendarMode): { prev: string; next: string } {
  if (mode === "semana") return { prev: "Semana anterior", next: "Semana siguiente" };
  if (mode === "dia") return { prev: "Día anterior", next: "Día siguiente" };
  return { prev: "Mes anterior", next: "Mes siguiente" };
}

function fmt(date: Date, options: Intl.DateTimeFormatOptions): string {
  return cachedDateTimeFormat("es-MX", options).format(date).toLowerCase();
}

/** "noviembre de 2026" · "2 – 8 de noviembre de 2026" · "viernes, 6 de noviembre de 2026" (lowercase es-MX). */
export function calendarTitle(mode: CalendarMode, cursor: Date): string {
  if (mode === "mes") return fmt(cursor, { month: "long", year: "numeric" });
  if (mode === "dia") return fmt(cursor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const start = startOfWeek(cursor);
  const end = addDays(start, 6);
  if (start.getFullYear() !== end.getFullYear()) {
    return `${fmt(start, { day: "numeric", month: "long", year: "numeric" })} – ${fmt(end, { day: "numeric", month: "long", year: "numeric" })}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${fmt(start, { day: "numeric", month: "long" })} – ${fmt(end, { day: "numeric", month: "long", year: "numeric" })}`;
  }
  return `${start.getDate()} – ${fmt(end, { day: "numeric", month: "long", year: "numeric" })}`;
}

/** "viernes 6" (aside heading of the selected day). */
export function shortDayLabel(date: Date): string {
  return `${fmt(date, { weekday: "long" })} ${date.getDate()}`;
}

/** "1 evento" / "4 eventos". */
export function eventCountLabel(count: number): string {
  return count === 1 ? "1 evento" : `${count} eventos`;
}

/** Tramos in catalog order (`sortOrder`). */
export function orderedTramos(tramos: WorkflowRef[]): WorkflowRef[] {
  return [...tramos].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Data-series color of a tramo key: the first three tramos of the catalog
 * (Presale, Diseño, Construcción) are `chart-1..3` (FE §14.2); any other key
 * (sin tramo, administración) is neutral.
 */
export function tramoColorVarFor(key: string | null | undefined, tramos: WorkflowRef[]): string {
  if (!key) return NEUTRAL_COLOR_VAR;
  const ordered = orderedTramos(tramos);
  const index = ordered.findIndex((t) => t.key === key);
  // The color an admin chose in Ajustes › Tramos y fases wins.
  const chosen = index >= 0 ? ordered[index].colorSlot : null;
  if (typeof chosen === "number" && chosen >= 1 && chosen <= 5) return `var(--chart-${chosen})`;
  if (index < 0 || index > 2) return NEUTRAL_COLOR_VAR;
  return `var(--chart-${index + 1})`;
}

/** `≈09:00`: task times are estimated (tasks only store dates). */
export function approxTime(time: string): string {
  return `≈${time}`;
}

const EVENT_HASH_PREFIX = "#evento-";

/** Link of an event: the task sheet deep link plus the event id (for the detail popover). */
export function eventHref(event: CalendarEvent): string {
  return `/tareas?tarea=${encodeURIComponent(event.taskId)}${EVENT_HASH_PREFIX}${encodeURIComponent(event.id)}`;
}

/** The event id carried by an `eventHref`, or null. */
export function eventIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const at = href.indexOf(EVENT_HASH_PREFIX);
  if (at < 0) return null;
  try {
    return decodeURIComponent(href.slice(at + EVENT_HASH_PREFIX.length));
  } catch {
    return null;
  }
}

export function isDelivery(event: CalendarEvent): boolean {
  return event.type === DELIVERY_TYPE;
}

/** One `AgendaItem` per event: deliveries are all-day; other times are estimated ("≈"). */
export function toAgendaItem(event: CalendarEvent, tramos: WorkflowRef[]): AgendaItem {
  const allDay = isDelivery(event);
  const known = tramos.some((t) => t.key === event.tramo);
  return {
    id: event.id,
    title: event.title,
    start: allDay ? event.date : `${event.date}T${event.time}:00`,
    allDay,
    estimated: !allDay,
    project: event.project,
    tramo: known ? event.tramo : null,
    attendees: event.attendees?.length ? event.attendees : event.responsible ? [event.responsible] : [],
    href: eventHref(event),
    ...(event.meetingUrl ? { meetingUrl: event.meetingUrl } : {}),
  };
}

export function eventsBetween(events: CalendarEvent[], from: string, to: string): CalendarEvent[] {
  return events.filter((e) => e.date >= from && e.date <= to);
}

/** Events the mode shows in its main area (semana: the current week only). */
export function eventsForMode(events: CalendarEvent[], mode: CalendarMode, cursor: Date): CalendarEvent[] {
  if (mode === "mes") {
    const { from, to } = visibleRange("mes", cursor);
    return eventsBetween(events, from, to);
  }
  if (mode === "semana") {
    const start = startOfWeek(cursor);
    return eventsBetween(events, dayKey(start), dayKey(addDays(start, 6)));
  }
  const key = dayKey(cursor);
  return eventsBetween(events, key, key);
}

/** Events of one day, by (estimated) time. */
export function eventsOfDay(events: CalendarEvent[], key: string): CalendarEvent[] {
  return groupEventsByDate(eventsBetween(events, key, key)).get(key) ?? [];
}

function shortRangeLabel(start: Date, end: Date): string {
  const endLabel = fmt(end, { day: "numeric", month: "short" }).replace(/\.$/, "");
  if (start.getMonth() === end.getMonth()) return `${start.getDate()}–${endLabel}`;
  return `${fmt(start, { day: "numeric", month: "short" }).replace(/\.$/, "")} – ${endLabel}`;
}

/**
 * "Entregas por semana": one segment per week of the cursor's month grid,
 * value = deliveries that week; `extra` holds the count per tramo (stacked
 * bars / extra columns).
 */
export function weeklyDeliveries(events: CalendarEvent[], cursor: Date, tramos: WorkflowRef[]): DistributionSegment[] {
  const { from, to } = monthGridRange(cursor);
  const ordered = orderedTramos(tramos);
  const segments: DistributionSegment[] = [];
  let weekStart = from;
  let index = 0;
  while (weekStart <= to) {
    const weekEnd = addDays(weekStart, 6);
    const deliveries = eventsBetween(events, dayKey(weekStart), dayKey(weekEnd)).filter(isDelivery);
    const extra: Record<string, number> = {};
    for (const tramo of ordered) extra[tramo.key] = deliveries.filter((d) => d.tramo === tramo.key).length;
    segments.push({
      key: dayKey(weekStart),
      label: shortRangeLabel(weekStart, weekEnd),
      value: deliveries.length,
      colorVar: genericSeriesVar(index),
      extra,
    });
    weekStart = startOfDay(addDays(weekStart, 7));
    index += 1;
  }
  return segments;
}

/** Tramo summary: events per tramo (value) and their deliveries (secondary). Unknown tramos group as "Sin tramo". */
export function tramoSummary(events: CalendarEvent[], tramos: WorkflowRef[]): DistributionSegment[] {
  const ordered = orderedTramos(tramos);
  const segments: DistributionSegment[] = ordered.map((tramo) => {
    const own = events.filter((e) => e.tramo === tramo.key);
    return {
      key: tramo.key,
      label: tramo.name,
      value: own.length,
      colorVar: tramoColorVarFor(tramo.key, tramos),
      secondary: own.filter(isDelivery).length,
    };
  });
  const others = events.filter((e) => !ordered.some((t) => t.key === e.tramo));
  if (others.length > 0) {
    segments.push({
      key: "otros",
      label: "Sin tramo",
      value: others.length,
      colorVar: NEUTRAL_COLOR_VAR,
      secondary: others.filter(isDelivery).length,
    });
  }
  return segments.filter((s) => s.value > 0);
}

/** "Entregas del mes" table (Mes · Analítico): deliveries of the cursor's month, by date. */
export function monthDeliveriesTable(events: CalendarEvent[], cursor: Date): RecordTableData {
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const rows = eventsBetween(events, dayKey(monthStart), dayKey(monthEnd))
    .filter(isDelivery)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    .map((e) => ({
      id: e.id,
      fecha: e.date,
      tarea: e.title,
      proyecto: e.project,
      tramo: e.tramoLabel,
      responsable: e.responsible,
    }));
  return {
    columns: [
      { key: "fecha", label: "Fecha", format: "date", mono: true },
      { key: "tarea", label: "Tarea" },
      { key: "proyecto", label: "Proyecto" },
      { key: "tramo", label: "Tramo" },
      { key: "responsable", label: "Responsable" },
    ],
    rows,
  };
}

/**
 * Daily summary of the cursor's week (Semana · Analítico): events and
 * deliveries per day, share of the week (heat) and Δ vs the same weekday of
 * last week.
 */
export function weekDailySummary(events: CalendarEvent[], cursor: Date): RecordTableData {
  const start = startOfWeek(cursor);
  const weekTotal = eventsBetween(events, dayKey(start), dayKey(addDays(start, 6))).length;
  const rows = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    const key = dayKey(day);
    const lastWeekKey = dayKey(addDays(day, -7));
    const own = eventsBetween(events, key, key);
    const previous = eventsBetween(events, lastWeekKey, lastWeekKey).length;
    return {
      id: key,
      dia: fmt(day, { weekday: "long", day: "numeric" }),
      eventos: own.length,
      entregas: own.filter(isDelivery).length,
      carga: weekTotal === 0 ? 0 : Math.round((own.length / weekTotal) * 100),
      delta: own.length - previous,
    };
  });
  return {
    columns: [
      { key: "dia", label: "Día" },
      { key: "eventos", label: "Eventos", align: "right", mono: true, format: "count" },
      { key: "entregas", label: "Entregas", align: "right", mono: true, format: "count" },
      { key: "carga", label: "% de la semana", align: "right", mono: true, format: "percent" },
      { key: "delta", label: "Δ vs semana pasada", align: "right", mono: true, format: "delta" },
    ],
    rows,
    totals: "auto",
    heat: [{ key: "carga", warnAt: 45, critAt: 60 }],
  };
}

/** Generic series color for non-tramo series (FE §14.2). */
export function genericSeriesVar(index: number): string {
  return GENERIC_SERIES[index % GENERIC_SERIES.length];
}
