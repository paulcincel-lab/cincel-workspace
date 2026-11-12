"use client";

import { formatHours } from "@/lib/calendario/alerts";
import { DayCellExtras } from "./DayCellExtras";
import { OverlapTag } from "./DayLoadMeter";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { useQuickAddCreate } from "@/components/tareas/quick-add-create";
import { DEFAULT_DAY_END, DEFAULT_DAY_START, HOUR_ROW_REM, hhmm, layoutDay, minutesInZone, nowFraction } from "@/components/calendario/day-layout";
import { useNow } from "@/components/calendario/use-now";
import { QuickAddRow, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { qk } from "@/lib/query/keys";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { useGeneralSettings } from "@/lib/settings/use-general-settings";
import type { CalEventItem, CalItem, CalTaskItem, CalendarioQuery, CalendarioRange } from "@/lib/types/calendario";

export type CalendarDayTimelineProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  /** `calendario.day_start` / `day_end` (the jornada of Control de horario when set). */
  dayStart?: string;
  dayEnd?: string;
  onOpen?(id: string): void;
  onMove?(item: CalItem, date: string): void;
};

const TASKS_HEADING = "TAREAS DEL DÍA · SIN HORA";
const ADD_TASK = "Tarea para este día";

function eventTime(item: CalEventItem, timeZone: string): string {
  return `${hhmm(minutesInZone(item.start, timeZone))} – ${hhmm(minutesInZone(item.end, timeZone))}`;
}

/** Día: hourly timeline with meeting blocks and the now line, plus the day's tasks without a time. */
export function CalendarDayTimeline({
  range,
  query,
  dayStart = DEFAULT_DAY_START,
  dayEnd = DEFAULT_DAY_END,
  onOpen,
}: CalendarDayTimelineProps) {
  const { timeZone } = useGeneralSettings().regional;
  const now = useNow(60_000);
  const date = query.fecha;
  const layout = useMemo(() => layoutDay(range.items, date, dayStart, dayEnd, timeZone), [range.items, date, dayStart, dayEnd, timeZone]);
  const line = nowFraction(now, range.today, date, dayStart, dayEnd, timeZone);
  const nowLabel = hhmm(minutesInZone(now, timeZone));
  const heightRem = layout.hours.length * HOUR_ROW_REM;
  const pinned = [...layout.allDay.map((item) => ({ item, label: "Todo el día" })), ...layout.before.map(({ item }) => ({ item, label: eventTime(item, timeZone) }))];

  return (
    <section aria-label="Día" data-slot="calendar-day-timeline" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-col gap-1">
          <DayCellExtras day={range.days.find((d) => d.date === date)} />
        </div>
        {pinned.length > 0 ? (
          <ul className="mb-2 flex flex-col gap-1" aria-label="Antes de la jornada">
            {pinned.map(({ item, label }) => (
              <li key={item.id}>
                <EventButton item={item} label={label} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="relative border-t" style={{ height: `${heightRem}rem` }} data-slot="calendar-day-hours">
          {layout.hours.map((minutes, index) => (
            <div
              key={minutes}
              className="absolute inset-x-0 flex border-b"
              style={{ top: `${index * HOUR_ROW_REM}rem`, height: `${HOUR_ROW_REM}rem` }}
            >
              <span className="w-12 shrink-0 pt-1 pr-2 text-right font-mono text-xs text-muted-foreground">{hhmm(minutes)}</span>
            </div>
          ))}
          <ul className="absolute inset-y-0 right-0 left-12 m-0 list-none p-0">
            {layout.blocks.map((block) => (
              <li
                key={block.item.id}
                className="absolute px-0.5"
                style={{
                  top: `${block.top * 100}%`,
                  height: `${block.height * 100}%`,
                  left: `${(block.lane / block.lanes) * 100}%`,
                  width: `${100 / block.lanes}%`,
                }}
              >
                <EventButton item={block.item} label={eventTime(block.item, timeZone)} onOpen={onOpen} block overlapping={block.lanes > 1} />
              </li>
            ))}
          </ul>
          {line !== null ? (
            <div
              aria-hidden="true"
              data-slot="calendar-now-line"
              className="pointer-events-none absolute right-0 left-12 h-0.5 bg-destructive"
              style={{ top: `${line * 100}%` }}
            />
          ) : null}
          {line !== null ? <span className="sr-only">{`Ahora, ${nowLabel}`}</span> : null}
        </div>
        {layout.after.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1" aria-label="Después de la jornada">
            {layout.after.map(({ item }) => (
              <li key={item.id}>
                <EventButton item={item} label={eventTime(item, timeZone)} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <DayTasksColumn tasks={layout.tasks} date={date} onOpen={onOpen} />
    </section>
  );
}

function EventButton({ item, label, onOpen, block = false, overlapping = false }: { item: CalEventItem; label: string; onOpen?: (id: string) => void; block?: boolean; overlapping?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(item.id)}
      className={`flex w-full flex-col items-start overflow-hidden rounded-md border bg-muted px-2 py-1 text-left text-xs text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring ${block ? "h-full" : ""}`}
    >
      <span className="w-full truncate font-semibold">{item.title}</span>
      <span className="font-mono text-muted-foreground">{label}</span>
      {overlapping ? <OverlapTag /> : null}
    </button>
  );
}

function DayTasksColumn({ tasks, date, onOpen }: { tasks: CalTaskItem[]; date: string; onOpen?: (id: string) => void }) {
  const qc = useQueryClient();
  const quickAdd = useQuickAddCreate();
  const user = useSessionStore(selectAuthenticatedUser);
  const canCreate = useMemo(() => resolveActivitiesCapabilities(user).canCreateActivity, [user]);
  const onCreate = useCallback(
    async (draft: QuickAddDraft) => {
      const created = await quickAdd.create({ ...draft, dueDate: draft.dueDate ?? date });
      await qc.invalidateQueries({ queryKey: qk.calendario.all });
      return created;
    },
    [quickAdd, qc, date],
  );

  return (
    <aside aria-label={TASKS_HEADING} data-slot="calendar-day-tasks" className="flex min-w-0 flex-col gap-2 rounded-lg border p-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">{TASKS_HEADING}</h3>
      {tasks.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpen?.(task.id)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={`truncate ${task.completed ? "text-muted-foreground line-through" : task.overdue ? "text-destructive" : ""}`}>
                  {task.title}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {task.hoursSource === "task" ? <span className="font-mono">{formatHours(task.hours)} h</span> : null}
                  {task.tramo ? <span>{task.tramo.name}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {canCreate ? (
        <QuickAddRow variant="column" context={{ label: `+ ${ADD_TASK}`, projectId: null, placeholder: `+ ${ADD_TASK}` }} onCreate={onCreate} />
      ) : null}
    </aside>
  );
}
