"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

import CalendarFeedDialog from "@/components/calendario/CalendarFeedDialog";
import { EventDetailPopover } from "@/components/tareas/EventDetailPopover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { AgendaWidget } from "@/components/widgets/AgendaWidget";
import { CalendarSummaryWidget } from "@/components/widgets/CalendarSummaryWidget";
import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { syncGoogleCalendarAction, type GoogleCalendarSyncOutcome } from "@/lib/actions/calendar-actions";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import {
  approxTime,
  calendarFetchRange,
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
import { buildCalendarEvents } from "@/lib/calendar/calendar-service";
import { useGoogleConnectResult } from "@/lib/google/use-google-connect-result";
import { useActionMutation } from "@/lib/query/mutation";
import { CALENDAR_INTEGRATION_INVALIDATE } from "@/lib/query/options/calendar";
import { tareasCalendarOptions, tareasListFiltersOf } from "@/lib/query/options/tareas";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { clearSelectedDayOutside, selectSelectedDay, useTareasUi } from "@/lib/stores/tareas-ui-store";
import { claimCalendarAutoSync } from "@/lib/tareas/calendar-auto-sync";
import { parseTareasQuery } from "@/lib/tareas/query";
import type { TaskListRow, WorkflowRef } from "@/lib/types/core";
import type { CalendarItem } from "@/lib/types/redesign";

/** Header description of the Calendario view (FE §3.4). */
export const CALENDARIO_DESCRIPTION = "Fechas de entrega y agenda del equipo. Las horas con ≈ son estimadas.";

const FETCH_ERROR = "No se pudo sincronizar el calendario con el servidor. Los datos mostrados pueden estar desactualizados.";

const NO_ROWS: TaskListRow[] = [];

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
  tramos: WorkflowRef[];
  /** "Today" (tests); defaults to the current date. */
  today?: Date;
};

type Popover = { event: CalendarItem; anchor: HTMLElement };

/**
 * Writes the calendar mode and cursor to the URL with `history.replaceState`:
 * Next syncs it with `useSearchParams`, so the view re-renders on the client
 * with no server render, and the date survives reload and back/forward.
 * `fecha: null` removes `?fecha` (today).
 */
function replaceCalendarUrl(next: { cal?: CalendarMode; fecha?: string | null }): void {
  const params = new URLSearchParams(window.location.search);
  params.set("vista", "calendario");
  if (next.cal) params.set("cal", next.cal);
  if (next.fecha === null) params.delete("fecha");
  else if (next.fecha) params.set("fecha", next.fecha);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

/** A plain left click (no new tab or window asked for). */
function isPlainClick(e: MouseEvent<HTMLElement>): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * Calendario view of `/tareas` (redesign FE §3.4): the calendar data logic
 * (`buildCalendarEvents`, team scoping) presented through `AgendaWidget`
 * (mes / semana) and a single-style Día timeline, with a toolbar, the tramo
 * legend and an aside (selected day, "Entregas por semana", Google Calendar
 * feed).
 *
 * Data: `tareas.calendar(f, from, to)` for the range of `cal` + `?fecha`
 * (`calendarFetchRange`), keeping the previous range on screen while the next
 * one loads. Mode and cursor live on the URL (`replaceCalendarUrl`), the
 * selected day in `useTareasUi`. The Google auto-sync is a mutation that runs
 * once per browser session.
 */
export function TareasCalendario({ tramos, today: todayProp }: TareasCalendarioProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const query = useMemo(() => parseTareasQuery(new URLSearchParams(search)), [search]);
  const cal: CalendarMode = query.cal;
  const today = useMemo(() => startOfDay(todayProp ?? new Date()), [todayProp]);
  // `?fecha` anchors every mode; without it, today.
  const cursor = useMemo(() => (query.fecha ? fromDayKey(query.fecha) : today), [query.fecha, today]);

  const authenticatedUser = useSessionStore(selectAuthenticatedUser);
  const capabilities = useMemo(() => resolveCalendarCapabilities(authenticatedUser), [authenticatedUser]);
  const viewerName = authenticatedUser?.member.name?.trim() ?? "";

  const storedDay = useTareasUi(selectSelectedDay);
  const selectCalendarDay = useTareasUi((s) => s.selectCalendarDay);
  const [feedOpen, setFeedOpen] = useState(false);
  const [popover, setPopover] = useState<Popover | null>(null);
  const connectResult = useGoogleConnectResult();

  const range = useMemo(() => visibleRange(cal, cursor), [cal, cursor]);
  const fetchRange = useMemo(() => calendarFetchRange(cal, cursor), [cal, cursor]);
  // The stored day only while it is visible; otherwise the `?fecha` day (or today).
  const storedVisible = storedDay !== null && storedDay >= range.from && storedDay <= range.to;
  const selectedKey = storedVisible ? storedDay : dayKey(cursor);

  // `?fecha` moved the view away from the stored day: forget it.
  useEffect(() => {
    clearSelectedDayOutside(range);
  }, [range]);

  // The key hashes by value: a new filters object for the same values reuses the cached range.
  const filters = useMemo(() => tareasListFiltersOf(query), [query]);
  const calendarQuery = useQuery({
    ...tareasCalendarOptions(filters, fetchRange.from, fetchRange.to),
    enabled: capabilities.canViewCalendar,
  });
  const rows = calendarQuery.data ?? NO_ROWS;
  const fetchError = calendarQuery.isError ? FETCH_ERROR : null;

  // Back from connecting Google Calendar: reopen the dialog to finish turning sync on.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connectResult?.success) setFeedOpen(true);
  }, [connectResult]);

  // Keeps the user's Google "Cincel" calendar current, once per browser session; the
  // server also skips it when sync is off or ran recently (null). Failures stay silent here:
  // the dialog shows the stored error.
  const { mutate: autoSync } = useActionMutation<{ auto?: boolean }, GoogleCalendarSyncOutcome | null>(
    syncGoogleCalendarAction,
    {
      invalidate: (_vars, data) => (data === null ? [] : CALENDAR_INTEGRATION_INVALIDATE),
      onFormError: () => undefined,
    }
  );
  useEffect(() => {
    if (capabilities.canViewCalendar && claimCalendarAutoSync()) autoSync({ auto: true });
  }, [autoSync, capabilities.canViewCalendar]);

  // Same scoping as the legacy calendar: without the team calendar a viewer sees only their own events.
  const events = useMemo(() => {
    const all = buildCalendarEvents(rows);
    if (capabilities.canViewTeamCalendar) return all;
    const viewer = viewerName.toLowerCase();
    return all.filter((event) => event.responsible.toLowerCase() === viewer);
  }, [capabilities.canViewTeamCalendar, rows, viewerName]);

  const selectedDate = useMemo(() => fromDayKey(selectedKey), [selectedKey]);
  const viewDate = cursor;
  const eventsById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);
  const legend = useMemo(() => orderedTramos(tramos), [tramos]);
  const modeEvents = useMemo(() => eventsForMode(events, cal, viewDate), [cal, viewDate, events]);
  const modeItems = useMemo(() => modeEvents.map((e) => toAgendaItem(e, tramos)), [modeEvents, tramos]);
  const selectedEvents = useMemo(() => eventsOfDay(events, selectedKey), [events, selectedKey]);
  const selectedItems = useMemo(() => selectedEvents.map((e) => toAgendaItem(e, tramos)), [selectedEvents, tramos]);
  const deliveriesByWeek = useMemo(() => weeklyDeliveries(events, viewDate, tramos), [viewDate, events, tramos]);

  const title = calendarTitle(cal, viewDate);
  const labels = navLabels(cal);

  // Día opens on the selected day; Mes and Semana keep the cursor.
  const modeFecha = useCallback(
    (next: CalendarMode): string | null => (next === "dia" ? selectedKey : (query.fecha ?? null)),
    [query.fecha, selectedKey]
  );

  const hrefFor = useCallback(
    (next: CalendarMode) => {
      const params = new URLSearchParams(search);
      params.set("vista", "calendario");
      params.set("cal", next);
      const fecha = next === cal ? (query.fecha ?? null) : modeFecha(next);
      if (fecha) params.set("fecha", fecha);
      else params.delete("fecha");
      return `${pathname ?? "/tareas"}?${params.toString()}`;
    },
    [cal, modeFecha, pathname, query.fecha, search]
  );

  const changeMode = (e: MouseEvent<HTMLAnchorElement>, next: CalendarMode) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    if (next === cal) return;
    replaceCalendarUrl({ cal: next, fecha: modeFecha(next) });
  };

  const move = (direction: -1 | 1) => {
    const next = dayKey(shiftCursor(cal, viewDate, direction));
    replaceCalendarUrl({ fecha: next });
    if (cal === "dia") selectCalendarDay(next);
  };

  const goToday = () => {
    replaceCalendarUrl({ fecha: null });
    selectCalendarDay(null);
  };

  const openEvent = (event: CalendarItem, anchor: HTMLElement) => {
    selectCalendarDay(event.date);
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
                prefetch={false}
                scroll={false}
                onClick={(e) => changeMode(e, link.cal)}
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
