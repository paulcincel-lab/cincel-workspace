"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import CalendarFeedDialog from "@/components/calendario/CalendarFeedDialog";
import { EventDetailPopover } from "@/components/tareas/EventDetailPopover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { AgendaWidget } from "@/components/widgets/AgendaWidget";
import { CalendarSummaryWidget } from "@/components/widgets/CalendarSummaryWidget";
import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { syncGoogleCalendarAction } from "@/lib/actions/calendar-actions";
import { fetchCalendarAction } from "@/lib/actions/tasks-actions";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import {
  approxTime,
  calendarTitle,
  dayKey,
  eventCountLabel,
  eventIdFromHref,
  eventsForMode,
  eventsOfDay,
  fromDayKey,
  isDelivery,
  monthDeliveriesTable,
  navLabels,
  orderedTramos,
  shiftCursor,
  shortDayLabel,
  startOfDay,
  toAgendaItem,
  tramoColorVarFor,
  tramoSummary,
  visibleRange,
  weekDailySummary,
  weeklyDeliveries,
  type CalendarMode,
} from "@/lib/calendar/calendar-agenda";
import { addDays, buildCalendarEvents } from "@/lib/calendar/calendar-service";
import { RepositoryError, reportRepositoryError } from "@/lib/errors";
import { useGoogleConnectResult } from "@/lib/google/use-google-connect-result";
import type { TaskFilters, WorkflowRef } from "@/lib/types/core";
import type { CalendarData, CalendarItem } from "@/lib/types/redesign";

/** Header description of the Calendario view (FE §3.4). */
export const CALENDARIO_DESCRIPTION = "Fechas de entrega y agenda del equipo. Las horas con ≈ son estimadas.";

const FETCH_ERROR = "No se pudo sincronizar el calendario con el servidor. Los datos mostrados pueden estar desactualizados.";

/** Extra days fetched around the visible range so navigation does not refetch on every step. */
const RANGE_BUFFER_DAYS = 45;

/** Día timeline hours (inclusive start, exclusive end). */
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 19;
const HOUR_PX = 56;

const MODE_LINKS: { cal: CalendarMode; label: string }[] = [
  { cal: "mes", label: "Mes" },
  { cal: "semana", label: "Semana" },
  { cal: "dia", label: "Día" },
];

const WIDGET_MODE = { mes: "month", semana: "week", dia: "day" } as const;

export type TareasCalendarioProps = {
  /** `cal` of the `/tareas` query. */
  cal: CalendarMode;
  /** Tasks loaded by the RSC with `fetchCalendarAction` (same filters). */
  tasks: CalendarData;
  /** Range (inclusive `YYYY-MM-DD`) the RSC loaded `tasks` for; outside it the view fetches. */
  initialRange?: { from: string; to: string };
  tramos: WorkflowRef[];
  /** The `/tareas` filters the RSC loaded `tasks` with, applied when the view fetches another range. */
  filters?: TaskFilters;
  /** "Today" (tests); defaults to the current date. */
  today?: Date;
};

type Popover = { event: CalendarItem; anchor: HTMLElement };

/**
 * Calendario view of `/tareas` (redesign FE §3.4): the `UnifiedCalendar` data
 * logic (`buildCalendarEvents`, `groupEventsByDate`, team scoping) presented
 * through `AgendaWidget` (mes / semana) and a single-style Día timeline, with
 * a toolbar, the tramo legend and an aside (selected day, "Entregas por
 * semana", Google Calendar feed).
 */
export function TareasCalendario({ cal, tasks, initialRange, tramos, filters, today: todayProp }: TareasCalendarioProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = useMemo(() => startOfDay(todayProp ?? new Date()), [todayProp]);

  const authenticatedUser = useSessionStore(selectCurrentUser);
  const capabilities = useMemo(() => resolveCalendarCapabilities(authenticatedUser), [authenticatedUser]);
  const viewerName = authenticatedUser?.member.name?.trim() ?? "";

  const [rows, setRows] = useState<CalendarData>(tasks);
  const [loaded, setLoaded] = useState<{ from: string; to: string } | null>(initialRange ?? null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Date>(today);
  const [selectedKey, setSelectedKey] = useState<string>(() => dayKey(today));
  const [feedOpen, setFeedOpen] = useState(false);
  const [popover, setPopover] = useState<Popover | null>(null);
  const connectResult = useGoogleConnectResult();

  // The RSC reloads `tasks` when the filters change.
  const initialFrom = initialRange?.from ?? null;
  const initialTo = initialRange?.to ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(tasks);
    setLoaded(initialFrom && initialTo ? { from: initialFrom, to: initialTo } : null);
  }, [tasks, initialFrom, initialTo]);

  // Stable across renders while the filter values stay the same.
  const filtersKey = JSON.stringify(filters ?? {});
  const stableFilters = useMemo(() => JSON.parse(filtersKey) as TaskFilters, [filtersKey]);

  // Back from connecting Google Calendar: reopen the dialog to finish turning sync on.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connectResult?.success) setFeedOpen(true);
  }, [connectResult]);

  // Keeps the user's Google "Cincel" calendar current; the server skips it when sync is off or ran recently.
  useEffect(() => {
    void syncGoogleCalendarAction({ auto: true }).catch(() => undefined);
  }, []);

  const selectedDate = useMemo(() => fromDayKey(selectedKey), [selectedKey]);
  // Día follows the selected day; Mes and Semana follow the cursor.
  const viewDate = cal === "dia" ? selectedDate : cursor;
  const range = useMemo(() => visibleRange(cal, viewDate), [cal, viewDate]);

  // Fetch a buffered range whenever the visible range leaves the loaded one.
  useEffect(() => {
    if (loaded && range.from >= loaded.from && range.to <= loaded.to) return;
    const from = dayKey(addDays(fromDayKey(range.from), -RANGE_BUFFER_DAYS));
    const to = dayKey(addDays(fromDayKey(range.to), RANGE_BUFFER_DAYS));
    let cancelled = false;
    fetchCalendarAction(from, to, stableFilters)
      .then((next) => {
        if (cancelled) return;
        setFetchError(null);
        setRows(next);
        setLoaded({ from, to });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof RepositoryError) reportRepositoryError(err);
        setFetchError(FETCH_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [stableFilters, loaded, range]);

  // Same scoping as `UnifiedCalendar`: without the team calendar a viewer sees only their own events.
  const events = useMemo(() => {
    const all = buildCalendarEvents(rows);
    if (capabilities.canViewTeamCalendar) return all;
    const viewer = viewerName.toLowerCase();
    return all.filter((event) => event.responsible.toLowerCase() === viewer);
  }, [capabilities.canViewTeamCalendar, rows, viewerName]);

  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const legend = useMemo(() => orderedTramos(tramos), [tramos]);
  const modeEvents = useMemo(() => eventsForMode(events, cal, viewDate), [cal, viewDate, events]);
  const modeItems = useMemo(() => modeEvents.map((e) => toAgendaItem(e, tramos)), [modeEvents, tramos]);
  const selectedEvents = useMemo(() => eventsOfDay(events, selectedKey), [events, selectedKey]);
  const selectedItems = useMemo(() => selectedEvents.map((e) => toAgendaItem(e, tramos)), [selectedEvents, tramos]);
  const deliveriesByWeek = useMemo(() => weeklyDeliveries(events, viewDate, tramos), [viewDate, events, tramos]);

  const title = calendarTitle(cal, viewDate);
  const labels = navLabels(cal);

  const hrefFor = useCallback(
    (next: CalendarMode) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("vista", "calendario");
      params.set("cal", next);
      return `${pathname ?? "/tareas"}?${params.toString()}`;
    },
    [pathname, searchParams]
  );

  const move = (direction: -1 | 1) => {
    const next = shiftCursor(cal, viewDate, direction);
    setCursor(next);
    if (cal === "dia") setSelectedKey(dayKey(next));
  };

  const goToday = () => {
    setCursor(today);
    setSelectedKey(dayKey(today));
  };

  const openEvent = (event: CalendarItem, anchor: HTMLElement) => {
    setSelectedKey(event.date);
    setPopover({ event, anchor });
  };

  // Event links rendered by the widgets carry the event id; a click opens the detail popover.
  const onEventClick = (e: MouseEvent<HTMLElement>) => {
    const anchor = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    const id = eventIdFromHref(anchor?.getAttribute("href"));
    const event = id ? eventsById.get(id) : undefined;
    if (!anchor || !event) return;
    e.preventDefault();
    openEvent(event, anchor);
  };

  if (!capabilities.canViewCalendar) {
    return <p className="text-sm text-muted-foreground">No tienes permiso para ver el calendario.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section aria-label="Calendario" className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={goToday}>
            Hoy
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" aria-label={labels.prev} onClick={() => move(-1)}>
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon" aria-label={labels.next} onClick={() => move(1)}>
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <h2 className="text-lg font-semibold text-foreground" aria-live="polite">
            {title}
          </h2>

          {legend.length > 0 ? (
            <ul aria-label="Tramos" className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {legend.map((tramo) => (
                <li key={tramo.key} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-[3px]"
                    style={{ backgroundColor: tramoColorVarFor(tramo.key, tramos) }}
                  />
                  {tramo.name}
                </li>
              ))}
            </ul>
          ) : null}

          <nav aria-label="Vista del calendario" className="ml-auto inline-flex rounded-lg bg-muted p-0.5">
            {MODE_LINKS.map((link) => (
              <Link
                key={link.cal}
                href={hrefFor(link.cal)}
                scroll={false}
                aria-current={link.cal === cal ? "page" : undefined}
                className={buttonVariants({ size: "sm", variant: link.cal === cal ? "secondary" : "ghost" })}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {connectResult && !connectResult.success ? (
          <Alert>
            <AlertTitle>No se conectó Google Calendar</AlertTitle>
            <AlertDescription>{connectResult.message}</AlertDescription>
          </Alert>
        ) : null}

        {fetchError ? (
          <Alert>
            <AlertDescription>{fetchError}</AlertDescription>
          </Alert>
        ) : null}

        {cal === "dia" ? (
          <CalendarioDia
            date={viewDate}
            today={today}
            events={modeEvents}
            tramos={tramos}
            onOpen={openEvent}
          />
        ) : (
          <>
            <div onClickCapture={onEventClick}>
              <AgendaWidget
                title={title}
                items={modeItems}
                mode={WIDGET_MODE[cal]}
                groupBy="day"
                emptyText={cal === "mes" ? "No hay eventos este mes" : "No hay eventos esta semana"}
              />
            </div>
            {cal === "mes" ? (
              <CalendarSummaryWidget
                mode="month"
                tramos={tramoSummary(modeEvents, tramos)}
                deliveries={monthDeliveriesTable(events, viewDate)}
              />
            ) : (
              <CalendarSummaryWidget mode="week" daily={weekDailySummary(events, viewDate)} />
            )}
          </>
        )}
      </section>

      <aside aria-label="Agenda del día seleccionado" className="space-y-6">
        <div className="space-y-1" onClickCapture={onEventClick}>
          <p className="text-sm text-muted-foreground">{eventCountLabel(selectedEvents.length)}</p>
          <AgendaWidget
            title={shortDayLabel(selectedDate)}
            items={selectedItems}
            mode="day"
            groupBy="none"
            emptyText="Sin eventos este día"
          />
        </div>

        <DistributionWidget
          title="Entregas por semana"
          segments={deliveriesByWeek}
          totalLabel="entregas"
          extraColumns={legend.map((tramo) => ({ key: tramo.key, label: tramo.name }))}
        />

        <Button variant="outline" className="w-full" onClick={() => setFeedOpen(true)}>
          Sincronizar con Google Calendar
        </Button>
      </aside>

      <CalendarFeedDialog open={feedOpen} onClose={() => setFeedOpen(false)} />
      {popover ? (
        <EventDetailPopover event={popover.event} anchor={popover.anchor} onClose={() => setPopover(null)} />
      ) : null}
    </div>
  );
}

type CalendarioDiaProps = {
  date: Date;
  today: Date;
  events: CalendarItem[];
  tramos: WorkflowRef[];
  onOpen(event: CalendarItem, anchor: HTMLElement): void;
};

const BLOCK_BASE =
  "rounded-md border-l-[3px] text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/**
 * Tinted event block (FE §14.5): a known tramo gets `chart-N-tint` with
 * `chart-N-ink` text and a 3 px `chart-N` border; any other event sits on
 * `card` with `foreground` text and a neutral border.
 */
function eventBlock(tramoKey: string, tramos: WorkflowRef[], layout: string): { className: string; style: CSSProperties } {
  const color = tramoColorVarFor(tramoKey, tramos);
  const slot = /^var\(--chart-(\d)\)$/.exec(color)?.[1];
  if (!slot) {
    return {
      className: `${layout} ${BLOCK_BASE} border border-border bg-card text-foreground`,
      style: { borderLeftColor: color },
    };
  }
  return {
    className: `${layout} ${BLOCK_BASE} bg-[color-mix(in_oklab,var(--evt)_14%,var(--card))] text-[var(--evt-ink)] dark:bg-[color-mix(in_oklab,var(--evt)_22%,var(--card))]`,
    style: {
      borderLeftColor: "var(--evt)",
      ["--evt" as string]: `var(--chart-${slot})`,
      ["--evt-ink" as string]: `var(--chart-${slot}-ink, var(--foreground))`,
    } as CSSProperties,
  };
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function useNow(enabled: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

/**
 * Día (FE §3.4, frame `CalendarioDia`): one style only. Timeline 8:00–19:00
 * with tinted blocks (3 px tramo border), a "now" line on today, and the
 * "Vence hoy" panel with the day's deliveries.
 */
function CalendarioDia({ date, today, events, tramos, onOpen }: CalendarioDiaProps) {
  const isToday = dayKey(date) === dayKey(today);
  const now = useNow(isToday);
  const timed = events.filter((e) => !isDelivery(e));
  const due = events.filter(isDelivery);
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, i) => DAY_START_HOUR + i);
  const spanMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const offsetPx = (minutes: number) => {
    const clamped = Math.min(Math.max(minutes - DAY_START_HOUR * 60, 0), spanMinutes - 60);
    return (clamped / 60) * HOUR_PX;
  };
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = isToday && nowMinutes >= DAY_START_HOUR * 60 && nowMinutes <= DAY_END_HOUR * 60;
  const nowLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dueTitle = isToday ? "Vence hoy" : `Vence el ${shortDayLabel(date)}`;

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
      <section aria-label="Agenda del día" className="rounded-xl border border-border bg-card p-3">
        <div className="relative" style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX }}>
          {hours.map((hour) => (
            <div
              key={hour}
              aria-hidden="true"
              className="absolute inset-x-0 flex items-start gap-2 border-t border-border"
              style={{ top: (hour - DAY_START_HOUR) * HOUR_PX }}
            >
              <span className="-mt-2 w-12 bg-card pr-1 font-mono text-xs text-muted-foreground">{`${hour}:00`}</span>
            </div>
          ))}

          <ol aria-label="Eventos" className="absolute inset-y-0 left-14 right-0">
            {timed.map((event) => (
              <li key={event.id} className="absolute inset-x-1" style={{ top: offsetPx(minutesOf(event.time)) + 2, height: HOUR_PX - 4 }}>
                <button
                  type="button"
                  onClick={(e) => onOpen(event, e.currentTarget)}
                  {...eventBlock(event.tramo, tramos, "flex size-full flex-col overflow-hidden px-2 py-1")}
                >
                  <span className="truncate font-medium">{event.title}</span>
                  <span className="truncate text-xs">
                    {approxTime(event.time)} · {event.project}
                  </span>
                </button>
              </li>
            ))}
          </ol>

          {showNow ? (
            <div
              role="note"
              aria-label={`Ahora, ${nowLabel}`}
              className="pointer-events-none absolute inset-x-0 flex items-center gap-1"
              style={{ top: ((nowMinutes - DAY_START_HOUR * 60) / 60) * HOUR_PX }}
            >
              <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
              <span aria-hidden="true" className="h-0.5 flex-1 bg-primary" />
            </div>
          ) : null}
        </div>
        {timed.length === 0 ? <p className="pt-3 text-sm text-muted-foreground">Sin eventos este día</p> : null}
      </section>

      <section aria-labelledby="calendario-vence" className="rounded-xl border border-border bg-card p-4">
        <h3 id="calendario-vence" className="text-sm font-semibold text-foreground">
          {dueTitle}
        </h3>
        {due.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nada vence este día</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {due.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={(e) => onOpen(event, e.currentTarget)}
                  {...eventBlock(event.tramo, tramos, "flex w-full flex-col px-2 py-1.5")}
                >
                  <span className="font-medium">{event.title}</span>
                  <span className="text-xs">
                    {event.project} · {event.responsible}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
