"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import {
  addDays,
  applyCalendarFilters,
  buildCalendarFilterOptions,
  buildTypeSummary,
  dateKey,
  getWeekdayLabels,
  groupEventsByDate,
  startOfWeek,
  toDate,
} from "@/lib/calendar/calendar-service";
import type { CalendarEvent, CalendarFilters, CalendarView } from "@/lib/types/calendar";

type UnifiedCalendarProps = {
  events: CalendarEvent[];
  mode: "summary" | "full";
  canViewDailyAgenda?: boolean;
  canViewTeamCalendar?: boolean;
  viewerName?: string;
};

const PROJECT_EVENT_COLORS = ["#0e7490", "#db2777", "#f59e0b", "#2563eb", "#7c3aed", "#dc2626", "#059669"];

/**
 * Event-type badges use a monochrome opacity ladder (not real status colors —
 * brand is strictly black/white/gray) so each type stays visually distinct
 * without introducing off-palette hues. Fecha de entrega gets the darkest
 * tier since delivery dates are the highest-stakes type to notice at a glance.
 */
function typeClassName(type: string): string {
  if (type === "Compromiso") return "bg-muted text-muted-foreground";
  if (type === "Proxima revision") return "bg-border text-foreground";
  if (type === "Fecha de entrega") return "bg-foreground text-background";
  if (type === "Reunion") return "bg-foreground/60 text-background";
  return "bg-foreground/25 text-foreground";
}

function typePrefix(type: string): string {
  if (type === "Compromiso") return "C";
  if (type === "Proxima revision") return "R";
  if (type === "Fecha de entrega") return "E";
  if (type === "Reunion") return "J";
  return "O";
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
}

const UPCOMING_EVENTS_COLUMNS: ColumnDef<CalendarEvent, unknown>[] = [
  { accessorKey: "date", header: "Fecha" },
  { accessorKey: "time", header: "Hora" },
  {
    accessorKey: "title",
    header: "Actividad",
    cell: ({ row }) => (
      <Link href={row.original.href} className="font-semibold hover:text-foreground hover:underline">
        {row.original.title}
      </Link>
    ),
  },
  { accessorKey: "project", header: "Proyecto" },
  { accessorKey: "stageLabel", header: "Etapa" },
  { accessorKey: "responsible", header: "Responsable" },
  {
    accessorKey: "type",
    header: "Tipo",
    cell: ({ row }) => (
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeClassName(row.original.type)}`}>
        {row.original.type}
      </span>
    ),
  },
];

function fullDateLabel(key: string): string {
  const date = toDate(key);
  if (!date) return key;

  return date.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function UnifiedCalendar({
  events,
  mode,
  canViewDailyAgenda = true,
  canViewTeamCalendar = true,
  viewerName = "",
}: UnifiedCalendarProps) {
  const normalizedViewerName = viewerName.trim();
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string>(() => dateKey(today));

  const [filters, setFilters] = useState<CalendarFilters>({
    project: "Todos",
    responsible: "Todos",
    type: "Todos",
    stage: "Todas",
  });

  const options = useMemo(() => buildCalendarFilterOptions(events), [events]);
  const responsibleOptions = useMemo(() => {
    if (!canViewTeamCalendar && normalizedViewerName) {
      return [normalizedViewerName];
    }

    return options.responsibles;
  }, [canViewTeamCalendar, normalizedViewerName, options.responsibles]);
  const effectiveResponsibleFilter = !canViewTeamCalendar && normalizedViewerName
    ? normalizedViewerName
    : filters.responsible;
  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      responsible: effectiveResponsibleFilter,
    }),
    [effectiveResponsibleFilter, filters]
  );

  const scopedEvents = useMemo(() => {
    const source = canViewTeamCalendar
      ? events
      : events.filter((event) => event.responsible.toLowerCase() === normalizedViewerName.toLowerCase());

    if (mode === "summary") {
      return source;
    }

    return applyCalendarFilters(source, effectiveFilters);
  }, [canViewTeamCalendar, effectiveFilters, events, mode, normalizedViewerName]);

  const groupedByDate = useMemo(() => groupEventsByDate(scopedEvents), [scopedEvents]);
  const selectedDayEvents = groupedByDate.get(selectedDate) ?? [];

  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const event of scopedEvents) {
      if (map.has(event.project)) {
        continue;
      }

      map.set(event.project, PROJECT_EVENT_COLORS[map.size % PROJECT_EVENT_COLORS.length]);
    }

    return map;
  }, [scopedEvents]);

  const legend = useMemo(
    () => Array.from(projectColorMap.entries()).map(([project, color]) => ({ project, color })),
    [projectColorMap]
  );

  const monthGrid = useMemo(() => {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const leadingEmpty = (monthStart.getDay() + 6) % 7;
    const daysInMonth = monthEnd.getDate();
    const totalCells = Math.ceil((leadingEmpty + daysInMonth) / 7) * 7;

    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - leadingEmpty);

    return Array.from({ length: totalCells }).map((_, index) => {
      const currentDate = new Date(gridStart);
      currentDate.setDate(gridStart.getDate() + index);
      const key = dateKey(currentDate);

      return {
        key,
        isCurrentMonth: currentDate.getMonth() === monthStart.getMonth(),
        isToday: key === dateKey(today),
        dayNumber: currentDate.getDate(),
        events: groupedByDate.get(key) ?? [],
      };
    });
  }, [cursor, groupedByDate, today]);

  const weekDays = useMemo(() => {
    const date = toDate(selectedDate) ?? today;
    const weekStart = startOfWeek(date);

    return Array.from({ length: 7 }).map((_, index) => {
      const day = addDays(weekStart, index);
      const key = dateKey(day);
      return {
        key,
        label: day.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit" }),
        events: groupedByDate.get(key) ?? [],
      };
    });
  }, [groupedByDate, selectedDate, today]);

  const upcomingEvents = useMemo(() => {
    const todayKey = dateKey(today);
    return scopedEvents
      .filter((event) => event.date >= todayKey)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .slice(0, 20);
  }, [scopedEvents, today]);

  const typeSummary = useMemo(() => buildTypeSummary(scopedEvents), [scopedEvents]);

  const selectedDayLabel = fullDateLabel(selectedDate);

  return (
    <article className="rounded-2xl border border-border bg-card p-0 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Calendario</h2>
          <p className="text-xs text-muted-foreground">
            {mode === "summary" ? "Vista resumida del calendario ERP" : "Vista unificada de actividades y fechas clave"}
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="outline"
            className="h-auto px-3 py-1.5 font-medium"
            onClick={() => {
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelectedDate(dateKey(today));
            }}
          >
            Hoy
          </Button>
          <Button
            variant="ghost"
            className="h-auto px-2 py-1 text-2xl leading-none"
            onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
          >
            ‹
          </Button>
          <Button
            variant="ghost"
            className="h-auto px-2 py-1 text-2xl leading-none"
            onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
          >
            ›
          </Button>
          <p className="min-w-32 text-center text-base font-semibold capitalize text-foreground md:text-lg">{monthLabel(cursor)}</p>

          {mode === "full" ? (
            <div className="ml-1 flex items-center gap-1 rounded-xl border border-border p-1">
              {(["month", "week", "day"] as CalendarView[]).map((candidateView) => (
                <Button
                  key={candidateView}
                  variant={view === candidateView ? "default" : "ghost"}
                  size="sm"
                  className="h-auto px-2 py-1 text-xs"
                  onClick={() => setView(candidateView)}
                >
                  {candidateView === "month" ? "Mes" : candidateView === "week" ? "Semana" : "Dia"}
                </Button>
              ))}
            </div>
          ) : (
            <span className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground">Mes</span>
          )}
        </div>
      </div>

      {mode === "full" ? (
        <div className="grid gap-0 xl:grid-cols-[1fr_320px]">
          <div>
            <div className="grid grid-cols-2 gap-2 border-b border-border px-4 py-3 md:grid-cols-4">
              <Select value={filters.project} onValueChange={(value) => setFilters((current) => ({ ...current, project: value as string }))}>
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.projects.map((value) => (
                    <SelectItem key={`project-${value}`} value={value}>{value === "Todos" ? "Proyecto: Todos" : value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={effectiveResponsibleFilter}
                onValueChange={(value) => setFilters((current) => ({ ...current, responsible: value as string }))}
                disabled={!canViewTeamCalendar}
              >
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {responsibleOptions.map((value) => (
                    <SelectItem key={`resp-${value}`} value={value}>{value === "Todos" ? "Responsable: Todos" : value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.type} onValueChange={(value) => setFilters((current) => ({ ...current, type: value as string }))}>
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.types.map((value) => (
                    <SelectItem key={`type-${value}`} value={value}>{value === "Todos" ? "Tipo: Todos" : value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.stage} onValueChange={(value) => setFilters((current) => ({ ...current, stage: value as string }))}>
                <SelectTrigger className="h-10 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {options.stages.map((value) => (
                    <SelectItem key={`stage-${value}`} value={value}>{value === "Todas" ? "Etapa: Todas" : value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {view === "month" ? (
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-7 border-b border-border text-center text-sm font-semibold text-foreground">
                    {getWeekdayLabels().map((label) => (
                      <div key={label} className="border-r border-border py-2 last:border-r-0">{label}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {monthGrid.map((cell) => {
                      const visibleEvents = cell.events.slice(0, 2);
                      const hiddenCount = Math.max(0, cell.events.length - visibleEvents.length);

                      return (
                        <Button
                          key={cell.key}
                          variant="ghost"
                          className={`h-auto min-h-[96px] flex-col items-stretch justify-start rounded-none border-b border-r border-border p-1 text-left align-top font-normal ${cell.isCurrentMonth ? "bg-card hover:bg-muted" : "bg-muted text-muted-foreground hover:bg-muted"} ${cell.key === selectedDate ? "ring-2 ring-inset ring-ring" : ""}`}
                          onClick={() => setSelectedDate(cell.key)}
                        >
                          <div className="flex justify-end">
                            <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${cell.isToday ? "bg-foreground text-background" : "text-foreground"}`}>
                              {String(cell.dayNumber).padStart(2, "0")}
                            </span>
                          </div>

                          <div className="mt-1 space-y-1">
                            {visibleEvents.map((entry) => (
                              <Link
                                key={entry.id}
                                href={entry.href}
                                onClick={(event) => event.stopPropagation()}
                                className={`block truncate rounded border-l-4 px-2 py-1 text-[11px] font-semibold md:text-xs ${typeClassName(entry.type)}`}
                                style={{ borderLeftColor: projectColorMap.get(entry.project) || "#64748b" }}
                                title={`${entry.time} · ${entry.title} · ${entry.project}`}
                              >
                                {typePrefix(entry.type)}. {entry.title}
                              </Link>
                            ))}

                            {hiddenCount > 0 ? <p className="px-1 text-xs font-medium text-muted-foreground">+{hiddenCount} mas</p> : null}
                          </div>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {view === "week" ? (
              <div className="overflow-x-auto px-4 py-4">
                <div className="grid min-w-[900px] grid-cols-7 gap-3">
                  {weekDays.map((day) => (
                    <section key={day.key} className={`rounded-xl border p-3 ${day.key === selectedDate ? "border-ring bg-muted" : "border-border bg-card"}`}>
                      <Button variant="link" className="h-auto p-0 text-sm font-semibold text-foreground" onClick={() => setSelectedDate(day.key)}>{day.label}</Button>
                      <div className="mt-2 space-y-2">
                        {day.events.length === 0 ? <p className="text-xs text-muted-foreground">Sin eventos</p> : null}
                        {day.events.map((entry) => (
                          <Link key={entry.id} href={entry.href} className={`block rounded-lg px-2 py-1 text-xs font-semibold ${typeClassName(entry.type)}`}>
                            {entry.time} · {entry.title}
                          </Link>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}

            {view === "day" ? (
              <div className="px-4 py-4">
                <p className="mb-3 text-sm font-semibold capitalize text-foreground">{selectedDayLabel}</p>
                {!canViewDailyAgenda ? (
                  <p className="rounded-xl border border-border bg-muted px-3 py-3 text-sm text-foreground">No tienes permiso para ver la agenda diaria.</p>
                ) : selectedDayEvents.length === 0 ? (
                  <p className="rounded-xl border border-border bg-muted px-3 py-3 text-sm text-foreground">No hay eventos para este dia.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayEvents.map((entry) => (
                      <Link key={entry.id} href={entry.href} className="flex items-start justify-between rounded-xl border border-border px-3 py-2 hover:bg-muted">
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground">{entry.time}</p>
                          <p className="text-sm font-semibold text-foreground">{entry.title}</p>
                          <p className="text-xs text-foreground">{entry.project} · {entry.responsible}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeClassName(entry.type)}`}>{entry.type}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <aside className="border-l border-border bg-muted/50 p-4">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mini calendario</p>
              <p className="mt-1 text-sm capitalize text-foreground">{selectedDayLabel}</p>
            </div>

            <div className="mt-3 rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Agenda del dia</p>
              {canViewDailyAgenda ? (
                <>
                  <p className="mt-1 text-sm font-semibold text-foreground">{selectedDayEvents.length} evento(s)</p>
                  <div className="mt-2 space-y-2">
                    {selectedDayEvents.slice(0, 5).map((entry) => (
                      <div key={`agenda-${entry.id}`} className="rounded-lg border border-border bg-muted px-2 py-1">
                        <p className="text-xs font-semibold text-foreground">{entry.time} · {entry.project}</p>
                        <p className="text-xs text-muted-foreground">{entry.title}</p>
                      </div>
                    ))}
                    {selectedDayEvents.length === 0 ? <p className="text-xs text-muted-foreground">Sin actividades.</p> : null}
                  </div>
                  <Link href="/calendario" className="mt-3 inline-flex rounded-lg border border-border bg-card px-2 py-1 text-xs font-semibold text-foreground hover:bg-accent">Ver agenda completa del dia</Link>
                </>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Permiso restringido para agenda diaria.</p>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Totales</p>
              <p className="mt-1 text-xl font-bold text-foreground">{scopedEvents.length}</p>
              <p className="text-xs text-muted-foreground">eventos en vista actual</p>
            </div>

            <div className="mt-3 rounded-xl border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Resumen por tipo</p>
              <div className="mt-2 space-y-2">
                {typeSummary.map((row) => (
                  <div key={`summary-${row.type}`} className="flex items-center justify-between text-xs text-foreground">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${typeClassName(row.type)}`}>{row.type}</span>
                    <span className="font-semibold text-foreground">{row.total}</span>
                  </div>
                ))}
                {typeSummary.length === 0 ? <p className="text-xs text-muted-foreground">Sin datos.</p> : null}
              </div>
            </div>
          </aside>

          <div className="border-t border-border px-4 py-4 xl:col-span-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Proximos eventos</h3>
            <div className="mt-2">
              <DataTable
                columns={UPCOMING_EVENTS_COLUMNS}
                data={upcomingEvents}
                getRowId={(entry) => entry.id}
                emptyMessage="No hay eventos en los filtros seleccionados."
                tableClassName="min-w-[980px]"
              />
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-7 border-b border-border text-center text-sm font-semibold text-foreground">
                {getWeekdayLabels().map((label) => (
                  <div key={label} className="border-r border-border py-2 last:border-r-0">{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthGrid.map((cell) => {
                  const visibleEvents = cell.events.slice(0, 2);
                  const hiddenCount = Math.max(0, cell.events.length - visibleEvents.length);

                  return (
                    <Button
                      key={cell.key}
                      variant="ghost"
                      className={`h-auto min-h-[96px] flex-col items-stretch justify-start rounded-none border-b border-r border-border p-1 text-left align-top font-normal ${cell.isCurrentMonth ? "bg-card hover:bg-muted" : "bg-muted text-muted-foreground hover:bg-muted"} ${cell.key === selectedDate ? "ring-2 ring-inset ring-ring" : ""}`}
                      onClick={() => setSelectedDate(cell.key)}
                    >
                      <div className="flex justify-end">
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${cell.isToday ? "bg-foreground text-background" : "text-foreground"}`}>{String(cell.dayNumber).padStart(2, "0")}</span>
                      </div>
                      <div className="mt-1 space-y-1">
                        {visibleEvents.map((entry) => (
                          <Link
                            key={entry.id}
                            href={entry.href}
                            onClick={(event) => event.stopPropagation()}
                            className={`block truncate rounded border-l-4 px-2 py-1 text-[11px] font-semibold md:text-xs ${typeClassName(entry.type)}`}
                            style={{ borderLeftColor: projectColorMap.get(entry.project) || "#64748b" }}
                          >
                            {typePrefix(entry.type)}. {entry.title}
                          </Link>
                        ))}
                        {hiddenCount > 0 ? <p className="px-1 text-xs font-medium text-muted-foreground">+{hiddenCount} mas</p> : null}
                      </div>
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-border px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Agenda del dia seleccionado</h3>
              <p className="text-sm font-semibold capitalize text-foreground">{selectedDayLabel}</p>
            </div>

            {!canViewDailyAgenda ? (
              <p className="mt-3 rounded-xl border border-border bg-muted px-3 py-3 text-sm text-foreground">No tienes permiso para ver la agenda diaria.</p>
            ) : selectedDayEvents.length === 0 ? (
              <p className="mt-3 rounded-xl border border-border bg-muted px-3 py-3 text-sm text-foreground">No hay actividades para este dia.</p>
            ) : (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {selectedDayEvents.map((entry) => (
                  <Link
                    key={`summary-selected-${entry.id}`}
                    href={entry.href}
                    className="rounded-xl border border-border bg-card px-3 py-2 hover:bg-muted"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-muted-foreground">{entry.time}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeClassName(entry.type)}`}>{entry.type}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-foreground">{entry.title}</p>
                    <p className="text-xs text-foreground">{entry.project} · {entry.responsible}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-5 border-t border-border px-4 py-3 text-xs text-foreground md:text-sm">
            {legend.map((item) => (
              <span key={`legend-${item.project}`} className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                {item.project}
              </span>
            ))}
            <Link href="/calendario" className="ml-auto inline-flex rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent">Abrir modulo Calendario</Link>
          </div>
        </>
      )}
    </article>
  );
}
