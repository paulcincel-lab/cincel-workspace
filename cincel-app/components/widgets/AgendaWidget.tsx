"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { approxTime, buildMonthCells, CalendarWeekdayHeader, type MonthCell } from "@/components/calendario/UnifiedCalendar";
import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { LoadingSkeletonProps } from "@/components/shell/LoadingSkeleton";
import { useStyle } from "@/components/shell/StyleProvider";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StyleView } from "@/components/widgets/StyleView";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { addDays, getWeekdayLabels, startOfWeek } from "@/lib/calendar/calendar-service";
import { tramoColorSlot, tramoLabel, type TramoColorSlot } from "@/lib/tramos/compat";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { AgendaItem, RecordColumn, RecordTableData } from "@/lib/types/widgets";
import { cn } from "@/lib/utils";

/**
 * Agenda in three styles (redesign FE §4.10.1, §15.3 "Calendario", frames
 * `Calendario`, `CalendarioSemana`, `CalendarioEsencial`,
 * `CalendarioAnalitico`). Wraps `components/calendario/UnifiedCalendar` for the
 * month grid (`buildMonthCells`, `CalendarWeekdayHeader`) and its estimated
 * time mark (`approxTime`); presentation only, filters and navigation stay with
 * the page.
 *
 * - Visual: tinted time blocks (day) / time grid 8:00–19:00 with an all-day row
 *   (week) / month grid with tinted blocks and "+n más" (month). Blocks carry
 *   the tramo color as a 3 px left border.
 * - Esencial: list grouped by day (`groupBy="day"`, default) or one flat list
 *   (`groupBy="none"`), plain text.
 * - Analítico: `RecordTable` (Día, Hora, Duración, Evento, Proyecto, Tramo,
 *   Asistentes) with daily subtotals (`groupBy="day"`) and a total row; month
 *   adds the load heat table (events per day, > 45 % / > 60 % of the busiest
 *   day shaded) above it.
 *
 * Only items inside the visible range (the anchor day, its Monday-first week
 * or its month) are rendered, so every style shows the same numbers.
 * `meetingUrl` renders an "Abrir en Cutto" link only when the item has one.
 *
 * Widget-level states: `emptyText` / `emptyState` when no item falls in the
 * range; `loading` renders the `LoadingSkeleton` variant of the style.
 */
export type AgendaWidgetProps = {
  title: string;
  items: AgendaItem[];
  mode: "day" | "week" | "month";
  groupBy?: "day" | "none";
  /** Title of the empty state; ignored when `emptyState` is given. */
  emptyText?: string;
  emptyState?: EmptyStateProps;
  /** Renders the skeleton instead of the data. */
  loading?: boolean;
  /**
   * Day the range is anchored on (`YYYY-MM-DD`, UI-only input): the day, the
   * week containing it or its month. Defaults to the earliest item, else today.
   */
  anchorDate?: string;
};

export const AGENDA_EMPTY_TEXT = "Sin eventos en este periodo";
export const AGENDA_ALL_DAY_LABEL = "Todo el día";
export const AGENDA_CUTTO_LABEL = "Abrir en Cutto";

/** Visual week time grid: 8:00–19:00, 48 px per hour. */
export const AGENDA_HOUR_START = 8;
export const AGENDA_HOUR_END = 19;
const HOUR_PX = 48;
/** Duration drawn for a timed event without `end`. */
const DEFAULT_MINUTES = 30;
const MIN_BLOCK_PX = 22;
/** Events shown per Visual month cell before "+n más". */
const MONTH_CELL_EVENTS = 3;
/** Heat thresholds on the share of the busiest day, in % (FE §15.2). */
export const AGENDA_HEAT = { warnAt: 45, critAt: 60 } as const;

const DASH = "—";
const LOCALE = "es-MX";
const DAY_LABEL = new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" });
const MONTH_LABEL = new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric" });
const DAY_MONTH = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short" });
const WEEKDAYS = getWeekdayLabels();

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests and the assistant `render_timeline` adapter)
// ---------------------------------------------------------------------------

export type AgendaEntry = {
  item: AgendaItem;
  start: Date;
  end: Date | null;
  /** Local calendar day, `YYYY-MM-DD`. */
  dayKey: string;
  allDay: boolean;
  /** Duration in minutes; null for all-day events and events without `end`. */
  minutes: number | null;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local calendar day of a date, `YYYY-MM-DD`. */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A `YYYY-MM-DD` key as local midnight; null when malformed. */
export function parseDayKey(key: string): Date | null {
  const match = DATE_ONLY.exec(key.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseInstant(value: string | undefined): Date | null {
  if (!value || value.trim() === "") return null;
  const day = parseDayKey(value);
  if (day) return day;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Parses and sorts the items (day, all-day first, start); drops items with an unreadable `start`. */
export function toAgendaEntries(items: AgendaItem[]): AgendaEntry[] {
  const entries: AgendaEntry[] = [];
  for (const item of items) {
    const start = parseInstant(item.start);
    if (!start) continue;
    const allDay = item.allDay === true || DATE_ONLY.test(item.start.trim());
    const endDate = allDay ? null : parseInstant(item.end);
    const end = endDate && endDate.getTime() > start.getTime() ? endDate : null;
    entries.push({
      item,
      start,
      end,
      dayKey: localDayKey(start),
      allDay,
      minutes: end ? Math.round((end.getTime() - start.getTime()) / 60000) : null,
    });
  }
  return entries.sort(
    (a, b) =>
      a.dayKey.localeCompare(b.dayKey) ||
      Number(b.allDay) - Number(a.allDay) ||
      a.start.getTime() - b.start.getTime() ||
      a.item.title.localeCompare(b.item.title)
  );
}

export type AgendaRange = { from: Date; to: Date; fromKey: string; toKey: string };

/** The visible range of a mode around `anchor`: the day, its Monday-first week or its month. */
export function agendaRange(mode: AgendaWidgetProps["mode"], anchor: Date): AgendaRange {
  const day = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  let from = day;
  let to = day;
  if (mode === "week") {
    from = startOfWeek(day);
    to = addDays(from, 6);
  } else if (mode === "month") {
    from = new Date(day.getFullYear(), day.getMonth(), 1);
    to = new Date(day.getFullYear(), day.getMonth() + 1, 0);
  }
  return { from, to, fromKey: localDayKey(from), toKey: localDayKey(to) };
}

/** The anchor day: `anchorDate` when valid, else the earliest entry, else today. */
export function resolveAnchor(anchorDate: string | undefined, entries: AgendaEntry[], today: Date): Date {
  const fromProp = anchorDate ? parseDayKey(anchorDate) : null;
  if (fromProp) return fromProp;
  const first = entries[0];
  if (first) return parseDayKey(first.dayKey) ?? today;
  return today;
}

export function entriesInRange(entries: AgendaEntry[], range: AgendaRange): AgendaEntry[] {
  return entries.filter((e) => e.dayKey >= range.fromKey && e.dayKey <= range.toKey);
}

/** Entries per day, in day order. */
export function groupByDay(entries: AgendaEntry[]): Map<string, AgendaEntry[]> {
  const map = new Map<string, AgendaEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.dayKey);
    if (list) list.push(entry);
    else map.set(entry.dayKey, [entry]);
  }
  return map;
}

/** "lunes, 9 de noviembre" (lowercase, FE §13). */
export function agendaDayLabel(key: string): string {
  const date = parseDayKey(key);
  return date ? DAY_LABEL.format(date) : key;
}

/** "noviembre de 2026". */
export function agendaMonthLabel(date: Date): string {
  return MONTH_LABEL.format(date);
}

function shortDayLabel(date: Date): string {
  return `${WEEKDAYS[(date.getDay() + 6) % 7]} ${date.getDate()}`;
}

function clock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "09:00–10:30", "≈16:00–16:30" when estimated, "Todo el día". */
export function agendaTimeText(entry: AgendaEntry): string {
  if (entry.allDay) return AGENDA_ALL_DAY_LABEL;
  const text = entry.end ? `${clock(entry.start)}–${clock(entry.end)}` : clock(entry.start);
  return entry.item.estimated ? approxTime(text) : text;
}

/** "1 h 30 min", "2 h", "45 min"; "—" when unknown. */
export function formatAgendaDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return DASH;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "1 evento", "3 eventos". */
export function agendaCountText(n: number): string {
  return n === 1 ? "1 evento" : `${n} eventos`;
}

function attendeesText(n: number): string {
  return n === 1 ? "1 asistente" : `${n} asistentes`;
}

function sumMinutes(entries: AgendaEntry[]): number | null {
  const timed = entries.filter((e) => e.minutes !== null);
  return timed.length === 0 ? null : timed.reduce((sum, e) => sum + (e.minutes ?? 0), 0);
}

type TramoInfo = { slot: TramoColorSlot | null; label: string };

function tramoInfo(tramo: string | null | undefined): TramoInfo | null {
  if (!tramo) return null;
  return { slot: tramoColorSlot(tramo), label: tramoLabel(tramo) };
}

function metaText(entry: AgendaEntry, tramo: TramoInfo | null): string {
  const parts: string[] = [];
  if (entry.item.project) parts.push(entry.item.project);
  if (tramo) parts.push(tramo.label);
  const attendees = entry.item.attendees?.length ?? 0;
  if (attendees > 0) parts.push(attendeesText(attendees));
  return parts.join(" · ");
}

export type AgendaRowKind = "event" | "subtotal" | "total";

const TABLE_COLUMNS: RecordColumn[] = [
  { key: "dia", label: "Día", format: "text" },
  { key: "hora", label: "Hora", mono: true, format: "text" },
  { key: "duracion", label: "Duración", align: "right", mono: true, format: "text" },
  { key: "evento", label: "Evento", format: "text" },
  { key: "proyecto", label: "Proyecto", format: "text" },
  { key: "tramo", label: "Tramo", format: "text" },
  { key: "asistentes", label: "Asistentes", align: "right", mono: true, format: "text" },
];

/**
 * The Analítico events table: one row per event (cells already formatted as
 * text), a subtotal row after each day when `groupBy` is "day" (events and
 * hours of the day) and a total row.
 */
export function agendaTableData(entries: AgendaEntry[], groupBy: "day" | "none" = "day"): RecordTableData {
  const rows: Record<string, unknown>[] = [];
  const eventRow = (entry: AgendaEntry): Record<string, unknown> => {
    const date = parseDayKey(entry.dayKey);
    return {
      id: entry.item.id,
      kind: "event",
      dayKey: entry.dayKey,
      dia: date ? shortDayLabel(date) : entry.dayKey,
      hora: agendaTimeText(entry),
      duracion: formatAgendaDuration(entry.minutes),
      evento: entry.item.title,
      proyecto: entry.item.project ?? DASH,
      tramo: entry.item.tramo ? tramoLabel(entry.item.tramo) : DASH,
      asistentes: String(entry.item.attendees?.length ?? 0),
    };
  };
  const summaryRow = (
    kind: "subtotal" | "total",
    label: string,
    list: AgendaEntry[],
    dayKey?: string
  ): Record<string, unknown> => ({
    id: kind === "total" ? "total" : `subtotal:${dayKey}`,
    kind,
    dayKey,
    count: list.length,
    dia: label,
    hora: "",
    duracion: formatAgendaDuration(sumMinutes(list)),
    evento: agendaCountText(list.length),
    proyecto: "",
    tramo: "",
    asistentes: String(list.reduce((sum, e) => sum + (e.item.attendees?.length ?? 0), 0)),
  });

  if (groupBy === "day") {
    for (const [dayKey, list] of groupByDay(entries)) {
      for (const entry of list) rows.push(eventRow(entry));
      const date = parseDayKey(dayKey);
      rows.push(summaryRow("subtotal", `Subtotal ${date ? shortDayLabel(date) : dayKey}`, list, dayKey));
    }
  } else {
    for (const entry of entries) rows.push(eventRow(entry));
  }
  if (entries.length > 0) rows.push(summaryRow("total", "Total", entries));
  return { columns: TABLE_COLUMNS, rows };
}

export type AgendaHeat = "none" | "warn" | "crit";

/** Heat of a day's load against the busiest day (> 45 % warn, > 60 % crit). */
export function agendaHeat(count: number, max: number): AgendaHeat {
  if (max <= 0 || count <= 0) return "none";
  const pct = (count / max) * 100;
  if (pct > AGENDA_HEAT.critAt) return "crit";
  if (pct > AGENDA_HEAT.warnAt) return "warn";
  return "none";
}

const DAY_COLUMN_KEYS = ["d0", "d1", "d2", "d3", "d4", "d5", "d6"] as const;

/**
 * The Analítico month load table: one row per Monday-first week, one column per
 * weekday with the events of that day (null outside the month) and the week total.
 */
export function agendaLoadTableData(month: Date, entries: AgendaEntry[], today: Date): RecordTableData {
  const cells = buildMonthCells(month, groupByDay(entries), today, localDayKey);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    const first = week[0];
    const last = week[week.length - 1];
    const row: Record<string, unknown> = {
      id: `week:${first.key}`,
      semana: `${first.date.getDate()} – ${DAY_MONTH.format(last.date)}`,
    };
    let total = 0;
    week.forEach((cell, index) => {
      const count = cell.isCurrentMonth ? cell.events.length : null;
      row[DAY_COLUMN_KEYS[index]] = count;
      row[`${DAY_COLUMN_KEYS[index]}Key`] = cell.key;
      total += count ?? 0;
    });
    row.total = total;
    rows.push(row);
  }
  const dayColumns: RecordColumn[] = DAY_COLUMN_KEYS.map((key, index) => ({
    key,
    label: WEEKDAYS[index],
    align: "right",
    mono: true,
    format: "count",
  }));
  return {
    columns: [
      { key: "semana", label: "Semana", format: "text" },
      ...dayColumns,
      { key: "total", label: "Total", align: "right", mono: true, format: "count" },
    ],
    rows,
  };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** Tint (14 % light / 22 % dark), ink text and left border per tramo slot (FE §14.5). */
const TRAMO_BLOCK: Record<TramoColorSlot, string> = {
  1: "border-l-[color:var(--chart-1)] bg-[color-mix(in_oklab,var(--chart-1)_14%,var(--card))] text-[color:var(--chart-1-ink,var(--foreground))] dark:bg-[color-mix(in_oklab,var(--chart-1)_22%,var(--card))]",
  2: "border-l-[color:var(--chart-2)] bg-[color-mix(in_oklab,var(--chart-2)_14%,var(--card))] text-[color:var(--chart-2-ink,var(--foreground))] dark:bg-[color-mix(in_oklab,var(--chart-2)_22%,var(--card))]",
  3: "border-l-[color:var(--chart-3)] bg-[color-mix(in_oklab,var(--chart-3)_14%,var(--card))] text-[color:var(--chart-3-ink,var(--foreground))] dark:bg-[color-mix(in_oklab,var(--chart-3)_22%,var(--card))]",
};
const NEUTRAL_BLOCK = "border-l-[color:var(--border-strong,var(--border))] bg-muted text-foreground";

const TRAMO_DOT: Record<TramoColorSlot, string> = {
  1: "bg-[color:var(--chart-1)]",
  2: "bg-[color:var(--chart-2)]",
  3: "bg-[color:var(--chart-3)]",
};

const FOCUS = "rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";
const LINK = cn("underline-offset-4 hover:underline", FOCUS);

function blockClass(tramo: TramoInfo | null): string {
  return tramo?.slot ? TRAMO_BLOCK[tramo.slot] : NEUTRAL_BLOCK;
}

function Title({ item, className }: { item: AgendaItem; className?: string }) {
  if (!item.href) return <span className={className}>{item.title}</span>;
  return (
    <Link href={item.href} className={cn(LINK, className)}>
      {item.title}
    </Link>
  );
}

function CuttoLink({ item, className }: { item: AgendaItem; className?: string }) {
  if (!item.meetingUrl) return null;
  return (
    <a
      href={item.meetingUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-slot="agenda-meeting-link"
      aria-label={`${AGENDA_CUTTO_LABEL}: ${item.title}`}
      className={cn("underline underline-offset-4", FOCUS, className)}
    >
      {AGENDA_CUTTO_LABEL}
    </a>
  );
}

function EventBlock({ entry, compact = false, style }: { entry: AgendaEntry; compact?: boolean; style?: CSSProperties }) {
  const tramo = tramoInfo(entry.item.tramo);
  if (compact) {
    return (
      <li
        data-slot="agenda-event"
        data-event-id={entry.item.id}
        style={style}
        title={`${agendaTimeText(entry)} · ${entry.item.title}`}
        className={cn("truncate rounded-sm border-l-3 px-1.5 py-0.5 text-[11.5px] leading-snug", blockClass(tramo))}
      >
        <Title item={entry.item} />
      </li>
    );
  }
  const meta = metaText(entry, tramo);
  return (
    <li
      data-slot="agenda-event"
      data-event-id={entry.item.id}
      style={style}
      className={cn("flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-md border-l-3 px-2.5 py-1.5", blockClass(tramo))}
    >
      <span className="font-mono text-[11.5px] tabular-nums">{agendaTimeText(entry)}</span>
      <Title item={entry.item} className="truncate text-sm font-medium" />
      {meta ? <span className="truncate text-xs">{meta}</span> : null}
      <CuttoLink item={entry.item} className="text-xs" />
    </li>
  );
}

function VisualDay({ dayKey, entries }: { dayKey: string; entries: AgendaEntry[] }) {
  return (
    <div data-style="visual" data-slot="agenda-widget" data-mode="day">
      <p className="mb-2 text-[13px] text-muted-foreground">
        {agendaDayLabel(dayKey)} · {agendaCountText(entries.length)}
      </p>
      <ol data-day={dayKey} data-count={entries.length} aria-label={agendaDayLabel(dayKey)} className="flex flex-col gap-2">
        {entries.map((entry) => (
          <EventBlock
            key={entry.item.id}
            entry={entry}
            style={
              entry.minutes !== null ? { minHeight: Math.max(52, Math.round((entry.minutes / 60) * HOUR_PX)) } : undefined
            }
          />
        ))}
      </ol>
    </div>
  );
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Greedy lanes so overlapping timed events sit side by side. */
function assignLanes(entries: AgendaEntry[]): { entry: AgendaEntry; lane: number; lanes: number }[] {
  const laneEnds: number[] = [];
  const placed = entries.map((entry) => {
    const start = minutesOfDay(entry.start);
    const end = start + (entry.minutes ?? DEFAULT_MINUTES);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    return { entry, lane };
  });
  const lanes = Math.max(1, laneEnds.length);
  return placed.map((p) => ({ ...p, lanes }));
}

function timedStyle(entry: AgendaEntry, lane: number, lanes: number): CSSProperties {
  const gridMinutes = (AGENDA_HOUR_END - AGENDA_HOUR_START) * 60;
  const startMin = Math.min(Math.max(minutesOfDay(entry.start) - AGENDA_HOUR_START * 60, 0), gridMinutes);
  const duration = entry.minutes ?? DEFAULT_MINUTES;
  const top = Math.min((startMin / 60) * HOUR_PX, (gridMinutes / 60) * HOUR_PX - MIN_BLOCK_PX);
  const maxHeight = (gridMinutes / 60) * HOUR_PX - top;
  const height = Math.max(Math.min((duration / 60) * HOUR_PX, maxHeight), MIN_BLOCK_PX);
  return {
    position: "absolute",
    top,
    height,
    left: `calc(${(lane / lanes) * 100}% + 2px)`,
    width: `calc(${100 / lanes}% - 4px)`,
  };
}

function DayNumber({ date, isToday }: { date: Date; isToday: boolean }) {
  return (
    <span
      data-today={isToday || undefined}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-full text-[13px] font-medium tabular-nums",
        isToday ? "bg-primary text-primary-foreground" : "text-foreground"
      )}
    >
      {date.getDate()}
    </span>
  );
}

function VisualWeek({ range, byDay, todayKey }: { range: AgendaRange; byDay: Map<string, AgendaEntry[]>; todayKey: string }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(range.from, i);
    const key = localDayKey(date);
    const entries = byDay.get(key) ?? [];
    return { key, date, entries, allDay: entries.filter((e) => e.allDay), timed: entries.filter((e) => !e.allDay) };
  });
  const hours = Array.from({ length: AGENDA_HOUR_END - AGENDA_HOUR_START }, (_, i) => AGENDA_HOUR_START + i);
  const gridHeight = hours.length * HOUR_PX;
  const columns = "grid grid-cols-[48px_repeat(7,minmax(0,1fr))]";

  return (
    <div data-style="visual" data-slot="agenda-widget" data-mode="week" className="overflow-x-auto">
      <div className="min-w-[760px] overflow-hidden rounded-lg border border-border">
        <div className={cn(columns, "border-b border-border")}>
          <span aria-hidden="true" />
          {days.map((day) => (
            <div
              key={day.key}
              data-day={day.key}
              data-count={day.entries.length}
              className="flex items-center justify-center gap-1.5 border-l border-border py-2 text-[13px] text-muted-foreground"
            >
              <span aria-hidden="true">{WEEKDAYS[(day.date.getDay() + 6) % 7]}</span>
              <span aria-hidden="true">
                <DayNumber date={day.date} isToday={day.key === todayKey} />
              </span>
              <span className="sr-only">
                {agendaDayLabel(day.key)}, {agendaCountText(day.entries.length)}
              </span>
            </div>
          ))}
        </div>

        <div className={cn(columns, "border-b border-border")} data-slot="agenda-all-day-row">
          <span className="px-1 py-1.5 text-[11px] leading-tight text-muted-foreground">{AGENDA_ALL_DAY_LABEL}</span>
          {days.map((day) => (
            <ul
              key={day.key}
              aria-label={`${AGENDA_ALL_DAY_LABEL}, ${agendaDayLabel(day.key)}`}
              className="flex min-w-0 flex-col gap-1 border-l border-border p-1"
            >
              {day.allDay.map((entry) => (
                <EventBlock key={entry.item.id} entry={entry} compact />
              ))}
            </ul>
          ))}
        </div>

        <div className={columns}>
          <div aria-hidden="true" className="relative" style={{ height: gridHeight }}>
            {hours.map((hour, i) => (
              <span
                key={hour}
                className="absolute right-1.5 font-mono text-[11px] text-muted-foreground tabular-nums"
                style={{ top: i * HOUR_PX + 2 }}
              >
                {pad(hour)}:00
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div key={day.key} className="relative border-l border-border" style={{ height: gridHeight }}>
              {hours.map((hour, i) => (
                <span
                  key={hour}
                  aria-hidden="true"
                  className="absolute inset-x-0 border-t border-border/60"
                  style={{ top: i * HOUR_PX }}
                />
              ))}
              <ul aria-label={agendaDayLabel(day.key)} className="absolute inset-0">
                {assignLanes(day.timed).map(({ entry, lane, lanes }) => (
                  <EventBlock key={entry.item.id} entry={entry} style={timedStyle(entry, lane, lanes)} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VisualMonth({ cells, month }: { cells: MonthCell<AgendaEntry>[]; month: Date }) {
  return (
    <div data-style="visual" data-slot="agenda-widget" data-mode="month">
      <p className="mb-2 text-[13px] text-muted-foreground">{agendaMonthLabel(month)}</p>
      <div className="overflow-x-auto">
        <div className="min-w-[720px] overflow-hidden rounded-lg border border-border">
          <div aria-hidden="true">
            <CalendarWeekdayHeader />
          </div>
          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const visible = cell.events.slice(0, MONTH_CELL_EVENTS);
              const hidden = cell.events.length - visible.length;
              return (
                <div
                  key={cell.key}
                  data-day={cell.key}
                  data-count={cell.events.length}
                  data-outside={!cell.isCurrentMonth || undefined}
                  className={cn(
                    "flex min-h-28 min-w-0 flex-col gap-1 border-r border-b border-border p-1 [&:nth-child(7n)]:border-r-0",
                    cell.isCurrentMonth ? "bg-card" : "bg-muted"
                  )}
                >
                  <div className="flex justify-end">
                    <span aria-hidden="true">
                      <DayNumber date={cell.date} isToday={cell.isToday} />
                    </span>
                    <span className="sr-only">
                      {agendaDayLabel(cell.key)}
                      {cell.events.length > 0 ? `, ${agendaCountText(cell.events.length)}` : ""}
                    </span>
                  </div>
                  {visible.length > 0 ? (
                    <ul className="flex flex-col gap-1">
                      {visible.map((entry) => (
                        <EventBlock key={entry.item.id} entry={entry} compact />
                      ))}
                    </ul>
                  ) : null}
                  {hidden > 0 ? <p className="px-1 text-[11.5px] text-muted-foreground">+{hidden} más</p> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function EsencialRow({ entry, withDate }: { entry: AgendaEntry; withDate: boolean }) {
  const tramo = tramoInfo(entry.item.tramo);
  const meta = metaText(entry, tramo);
  return (
    <li
      data-slot="agenda-event"
      data-event-id={entry.item.id}
      className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2.5"
    >
      <span className={cn("shrink-0 text-[13px] text-muted-foreground tabular-nums", withDate ? "w-56" : "w-28")}>
        {withDate ? `${agendaDayLabel(entry.dayKey)} · ` : ""}
        {agendaTimeText(entry)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <Title item={entry.item} className="text-foreground" />
        {meta ? <span className="text-[13px] text-muted-foreground">{meta}</span> : null}
      </span>
      <CuttoLink item={entry.item} className="text-[13px] text-foreground" />
    </li>
  );
}

function Esencial({ entries, groupBy }: { entries: AgendaEntry[]; groupBy: "day" | "none" }) {
  if (groupBy === "none") {
    return (
      <div data-style="esencial" data-slot="agenda-widget" className="text-[15px]">
        <ul className="divide-y divide-border">
          {entries.map((entry) => (
            <EsencialRow key={entry.item.id} entry={entry} withDate />
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div data-style="esencial" data-slot="agenda-widget" className="flex flex-col gap-5 text-[15px]">
      {Array.from(groupByDay(entries), ([dayKey, list]) => (
        <section key={dayKey} data-day={dayKey} data-count={list.length} aria-label={agendaDayLabel(dayKey)}>
          <h3 className="text-[13px] font-medium text-muted-foreground">
            {agendaDayLabel(dayKey)} · {agendaCountText(list.length)}
          </h3>
          <ul className="divide-y divide-border">
            {list.map((entry) => (
              <EsencialRow key={entry.item.id} entry={entry} withDate={false} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const RIGHT_MONO = "block text-right font-mono tabular-nums";

function renderEventCell(byId: Map<string, AgendaEntry>) {
  return function renderAgendaCell(columnKey: string, row: Record<string, unknown>): ReactNode | undefined {
    const kind = row.kind as AgendaRowKind;
    if (kind !== "event") {
      const text = String(row[columnKey] ?? "");
      if (columnKey === "evento") {
        return (
          <span
            data-slot={`agenda-${kind}`}
            data-day={kind === "subtotal" ? String(row.dayKey) : undefined}
            data-count={String(row.count)}
            className="font-medium text-foreground"
          >
            {text}
          </span>
        );
      }
      if (columnKey === "duracion" || columnKey === "asistentes") {
        return <span className={cn(RIGHT_MONO, "font-medium")}>{text}</span>;
      }
      return <span className="font-medium text-foreground">{text}</span>;
    }
    const entry = byId.get(String(row.id));
    if (!entry) return undefined;
    if (columnKey === "evento") {
      return (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <Title item={entry.item} />
          <CuttoLink item={entry.item} className="text-[11.5px]" />
        </span>
      );
    }
    if (columnKey === "tramo") {
      const tramo = tramoInfo(entry.item.tramo);
      if (!tramo) return DASH;
      return (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-2 shrink-0 rounded-full", tramo.slot ? TRAMO_DOT[tramo.slot] : "bg-muted-foreground")}
          />
          {tramo.label}
        </span>
      );
    }
    if (columnKey === "hora") return <span className="font-mono tabular-nums">{String(row.hora)}</span>;
    if (columnKey === "duracion" || columnKey === "asistentes") {
      return <span className={RIGHT_MONO}>{String(row[columnKey])}</span>;
    }
    return undefined;
  };
}

function AnaliticoEvents({ entries, groupBy }: { entries: AgendaEntry[]; groupBy: "day" | "none" }) {
  const byId = new Map(entries.map((entry) => [entry.item.id, entry]));
  return <RecordTable data={agendaTableData(entries, groupBy)} renderCell={renderEventCell(byId)} density="compacta" />;
}

const HEAT_CLASS: Record<AgendaHeat, string> = {
  none: "",
  warn: "bg-[color-mix(in_oklab,var(--warning)_22%,var(--card))] text-(--warning-ink)",
  crit: "bg-destructive/10 text-destructive",
};

function AnaliticoLoad({ month, entries, today }: { month: Date; entries: AgendaEntry[]; today: Date }) {
  const data = agendaLoadTableData(month, entries, today);
  const max = Math.max(0, ...data.rows.flatMap((row) => DAY_COLUMN_KEYS.map((key) => Number(row[key] ?? 0))));
  return (
    <RecordTable
      data={data}
      density="compacta"
      renderCell={(columnKey, row) => {
        if ((DAY_COLUMN_KEYS as readonly string[]).includes(columnKey)) {
          const value = row[columnKey];
          if (value === null || value === undefined) {
            return <span className={cn(RIGHT_MONO, "text-muted-foreground")}>{DASH}</span>;
          }
          const count = Number(value);
          const heat = agendaHeat(count, max);
          return (
            <span
              data-slot="agenda-load-cell"
              data-day={String(row[`${columnKey}Key`])}
              data-count={count}
              data-heat={heat}
              className={cn(RIGHT_MONO, "rounded-sm px-1.5", HEAT_CLASS[heat])}
            >
              {count}
            </span>
          );
        }
        if (columnKey === "total") return <span className={cn(RIGHT_MONO, "font-medium")}>{String(row.total)}</span>;
        return undefined;
      }}
    />
  );
}

function Analitico({
  mode,
  entries,
  groupBy,
  month,
  today,
}: {
  mode: AgendaWidgetProps["mode"];
  entries: AgendaEntry[];
  groupBy: "day" | "none";
  month: Date;
  today: Date;
}) {
  if (mode !== "month") {
    return (
      <div data-style="analitico" data-slot="agenda-widget" data-mode={mode} className="text-[12.5px]">
        <AnaliticoEvents entries={entries} groupBy={groupBy} />
      </div>
    );
  }
  return (
    <div data-style="analitico" data-slot="agenda-widget" data-mode="month" className="flex flex-col text-[12.5px]">
      <h3 className="px-3 pt-3 pb-1 text-[11.5px] font-medium text-muted-foreground">
        Carga por día · {agendaMonthLabel(month)}
      </h3>
      <AnaliticoLoad month={month} entries={entries} today={today} />
      <h3 className="border-t border-border px-3 pt-3 pb-1 text-[11.5px] font-medium text-muted-foreground">
        Eventos del mes
      </h3>
      <AnaliticoEvents entries={entries} groupBy={groupBy} />
    </div>
  );
}

function skeletonVariant(style: PresentationStyle, mode: AgendaWidgetProps["mode"]): LoadingSkeletonProps["variant"] {
  if (style === "analitico") return "table";
  if (style === "esencial" || mode === "day") return "list";
  return "calendar";
}

export function AgendaWidget({
  title,
  items,
  mode,
  groupBy = "day",
  emptyText,
  emptyState,
  loading = false,
  anchorDate,
}: AgendaWidgetProps) {
  const { style } = useStyle();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const all = toAgendaEntries(items);
  const anchor = resolveAnchor(anchorDate, all, today);
  const range = agendaRange(mode, anchor);
  const entries = entriesInRange(all, range);
  const byDay = groupByDay(entries);
  const empty: EmptyStateProps = emptyState ?? { title: emptyText ?? AGENDA_EMPTY_TEXT };

  const visual = (): ReactNode => {
    if (mode === "day") return <VisualDay dayKey={range.fromKey} entries={entries} />;
    if (mode === "week") return <VisualWeek range={range} byDay={byDay} todayKey={localDayKey(today)} />;
    return <VisualMonth cells={buildMonthCells(range.from, byDay, today, localDayKey)} month={range.from} />;
  };

  return (
    <WidgetCard
      title={title}
      emptyState={empty}
      loading={loading}
      skeleton={skeletonVariant(style, mode)}
      padded={style !== "analitico"}
    >
      {entries.length > 0 ? (
        <StyleView
          visual={visual}
          esencial={() => <Esencial entries={entries} groupBy={groupBy} />}
          analitico={() => (
            <Analitico mode={mode} entries={entries} groupBy={groupBy} month={range.from} today={today} />
          )}
        />
      ) : null}
    </WidgetCard>
  );
}
