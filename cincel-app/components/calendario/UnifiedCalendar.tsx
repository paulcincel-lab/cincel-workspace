"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
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

function typeClassName(type: string): string {
  if (type === "Compromiso") return "bg-blue-100 text-blue-800";
  if (type === "Proxima revision") return "bg-emerald-100 text-emerald-800";
  if (type === "Fecha de entrega") return "bg-amber-100 text-amber-800";
  if (type === "Reunion") return "bg-fuchsia-100 text-fuchsia-800";
  return "bg-cyan-100 text-cyan-800";
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
      <Link href={row.original.href} className="font-semibold hover:text-blue-700 hover:underline">
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
    <article className="rounded-2xl border border-slate-200 bg-white p-0 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Calendario</h2>
          <p className="text-xs text-slate-600">
            {mode === "summary" ? "Vista resumida del calendario ERP" : "Vista unificada de actividades y fechas clave"}
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setCursor(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelectedDate(dateKey(today));
            }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-800 hover:bg-slate-50"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            className="rounded px-2 py-1 text-2xl leading-none text-slate-700 hover:bg-slate-100"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCursor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            className="rounded px-2 py-1 text-2xl leading-none text-slate-700 hover:bg-slate-100"
          >
            ›
          </button>
          <p className="min-w-32 text-center text-base font-semibold capitalize text-slate-800 md:text-lg">{monthLabel(cursor)}</p>

          {mode === "full" ? (
            <div className="ml-1 flex items-center gap-1 rounded-xl border border-slate-200 p-1">
              {(["month", "week", "day"] as CalendarView[]).map((candidateView) => (
                <button
                  key={candidateView}
                  type="button"
                  onClick={() => setView(candidateView)}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold ${view === candidateView ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}
                >
                  {candidateView === "month" ? "Mes" : candidateView === "week" ? "Semana" : "Dia"}
                </button>
              ))}
            </div>
          ) : (
            <span className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700">Mes</span>
          )}
        </div>
      </div>

      {mode === "full" ? (
        <div className="grid gap-0 xl:grid-cols-[1fr_320px]">
          <div>
            <div className="grid grid-cols-2 gap-2 border-b border-slate-200 px-4 py-3 md:grid-cols-4">
              <select
                value={filters.project}
                onChange={(event) => setFilters((current) => ({ ...current, project: event.target.value }))}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900"
              >
                {options.projects.map((value) => (
                  <option key={`project-${value}`} value={value}>{value === "Todos" ? "Proyecto: Todos" : value}</option>
                ))}
              </select>
              <select
                value={effectiveResponsibleFilter}
                onChange={(event) => setFilters((current) => ({ ...current, responsible: event.target.value }))}
                disabled={!canViewTeamCalendar}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900"
              >
                {responsibleOptions.map((value) => (
                  <option key={`resp-${value}`} value={value}>{value === "Todos" ? "Responsable: Todos" : value}</option>
                ))}
              </select>
              <select
                value={filters.type}
                onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900"
              >
                {options.types.map((value) => (
                  <option key={`type-${value}`} value={value}>{value === "Todos" ? "Tipo: Todos" : value}</option>
                ))}
              </select>
              <select
                value={filters.stage}
                onChange={(event) => setFilters((current) => ({ ...current, stage: event.target.value }))}
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-slate-900"
              >
                {options.stages.map((value) => (
                  <option key={`stage-${value}`} value={value}>{value === "Todas" ? "Etapa: Todas" : value}</option>
                ))}
              </select>
            </div>

            {view === "month" ? (
              <div className="overflow-x-auto">
                <div className="min-w-[900px]">
                  <div className="grid grid-cols-7 border-b border-slate-200 text-center text-sm font-semibold text-slate-700">
                    {getWeekdayLabels().map((label) => (
                      <div key={label} className="border-r border-slate-200 py-2 last:border-r-0">{label}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {monthGrid.map((cell) => {
                      const visibleEvents = cell.events.slice(0, 2);
                      const hiddenCount = Math.max(0, cell.events.length - visibleEvents.length);

                      return (
                        <button
                          key={cell.key}
                          type="button"
                          onClick={() => setSelectedDate(cell.key)}
                          className={`min-h-[96px] border-b border-r border-slate-200 p-1 text-left align-top transition ${cell.isCurrentMonth ? "bg-white hover:bg-slate-50" : "bg-slate-50 text-slate-400"} ${cell.key === selectedDate ? "ring-2 ring-inset ring-blue-500" : ""}`}
                        >
                          <div className="flex justify-end">
                            <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${cell.isToday ? "bg-blue-600 text-white" : "text-slate-700"}`}>
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

                            {hiddenCount > 0 ? <p className="px-1 text-xs font-medium text-slate-500">+{hiddenCount} mas</p> : null}
                          </div>
                        </button>
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
                    <section key={day.key} className={`rounded-xl border p-3 ${day.key === selectedDate ? "border-blue-500 bg-blue-50/40" : "border-slate-200 bg-white"}`}>
                      <button type="button" onClick={() => setSelectedDate(day.key)} className="text-left text-sm font-semibold text-slate-900">{day.label}</button>
                      <div className="mt-2 space-y-2">
                        {day.events.length === 0 ? <p className="text-xs text-slate-500">Sin eventos</p> : null}
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
                <p className="mb-3 text-sm font-semibold capitalize text-slate-900">{selectedDayLabel}</p>
                {!canViewDailyAgenda ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">No tienes permiso para ver la agenda diaria.</p>
                ) : selectedDayEvents.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">No hay eventos para este dia.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedDayEvents.map((entry) => (
                      <Link key={entry.id} href={entry.href} className="flex items-start justify-between rounded-xl border border-slate-200 px-3 py-2 hover:bg-slate-50">
                        <div>
                          <p className="text-xs font-semibold text-slate-500">{entry.time}</p>
                          <p className="text-sm font-semibold text-slate-900">{entry.title}</p>
                          <p className="text-xs text-slate-700">{entry.project} · {entry.responsible}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeClassName(entry.type)}`}>{entry.type}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <aside className="border-l border-slate-200 bg-slate-50/50 p-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Mini calendario</p>
              <p className="mt-1 text-sm capitalize text-slate-900">{selectedDayLabel}</p>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Agenda del dia</p>
              {canViewDailyAgenda ? (
                <>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{selectedDayEvents.length} evento(s)</p>
                  <div className="mt-2 space-y-2">
                    {selectedDayEvents.slice(0, 5).map((entry) => (
                      <div key={`agenda-${entry.id}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1">
                        <p className="text-xs font-semibold text-slate-700">{entry.time} · {entry.project}</p>
                        <p className="text-xs text-slate-600">{entry.title}</p>
                      </div>
                    ))}
                    {selectedDayEvents.length === 0 ? <p className="text-xs text-slate-500">Sin actividades.</p> : null}
                  </div>
                  <Link href="/calendario" className="mt-3 inline-flex rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100">Ver agenda completa del dia</Link>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-600">Permiso restringido para agenda diaria.</p>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Totales</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{scopedEvents.length}</p>
              <p className="text-xs text-slate-600">eventos en vista actual</p>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">Resumen por tipo</p>
              <div className="mt-2 space-y-2">
                {typeSummary.map((row) => (
                  <div key={`summary-${row.type}`} className="flex items-center justify-between text-xs text-slate-700">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${typeClassName(row.type)}`}>{row.type}</span>
                    <span className="font-semibold text-slate-900">{row.total}</span>
                  </div>
                ))}
                {typeSummary.length === 0 ? <p className="text-xs text-slate-500">Sin datos.</p> : null}
              </div>
            </div>
          </aside>

          <div className="border-t border-slate-200 px-4 py-4 xl:col-span-2">
            <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Proximos eventos</h3>
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
              <div className="grid grid-cols-7 border-b border-slate-200 text-center text-sm font-semibold text-slate-700">
                {getWeekdayLabels().map((label) => (
                  <div key={label} className="border-r border-slate-200 py-2 last:border-r-0">{label}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthGrid.map((cell) => {
                  const visibleEvents = cell.events.slice(0, 2);
                  const hiddenCount = Math.max(0, cell.events.length - visibleEvents.length);

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      onClick={() => setSelectedDate(cell.key)}
                      className={`min-h-[96px] border-b border-r border-slate-200 p-1 text-left align-top transition ${cell.isCurrentMonth ? "bg-white hover:bg-slate-50" : "bg-slate-50 text-slate-400"} ${cell.key === selectedDate ? "ring-2 ring-inset ring-blue-500" : ""}`}
                    >
                      <div className="flex justify-end">
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-semibold ${cell.isToday ? "bg-blue-600 text-white" : "text-slate-700"}`}>{String(cell.dayNumber).padStart(2, "0")}</span>
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
                        {hiddenCount > 0 ? <p className="px-1 text-xs font-medium text-slate-500">+{hiddenCount} mas</p> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-600">Agenda del dia seleccionado</h3>
              <p className="text-sm font-semibold capitalize text-slate-900">{selectedDayLabel}</p>
            </div>

            {!canViewDailyAgenda ? (
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">No tienes permiso para ver la agenda diaria.</p>
            ) : selectedDayEvents.length === 0 ? (
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">No hay actividades para este dia.</p>
            ) : (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {selectedDayEvents.map((entry) => (
                  <Link
                    key={`summary-selected-${entry.id}`}
                    href={entry.href}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-slate-500">{entry.time}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${typeClassName(entry.type)}`}>{entry.type}</span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{entry.title}</p>
                    <p className="text-xs text-slate-700">{entry.project} · {entry.responsible}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-5 border-t border-slate-200 px-4 py-3 text-xs text-slate-700 md:text-sm">
            {legend.map((item) => (
              <span key={`legend-${item.project}`} className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                {item.project}
              </span>
            ))}
            <Link href="/calendario" className="ml-auto inline-flex rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100">Abrir modulo Calendario</Link>
          </div>
        </>
      )}
    </article>
  );
}
