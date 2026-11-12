"use client";

import { useMemo } from "react";

import {
  CalendarWeekdayHeader,
  buildMonthCells,
  type MonthCell,
} from "@/components/calendario/calendar-grid";
import { useCalendarDrag } from "@/components/calendario/use-calendar-drag";
import { Button } from "@/components/ui/shadcn/button";
import {
  dayCounts,
  hiddenCount,
  itemsByDate,
  localDateKey,
  monthLabel,
  parseDateKey,
} from "@/lib/calendario/move";
import { addDays } from "@/lib/time-tracking/local-time";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import type {
  CalItem,
  CalendarioQuery,
  CalendarioRange,
} from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

import { CalendarItemChip } from "./CalendarItemChip";
import { DayCellExtras } from "./DayCellExtras";
import {
  EMPTY_RANGE,
  EMPTY_DAY_NEW_TASK,
  MONTH_HINT,
  MORE_LABEL,
  OPEN_DAY_LABEL,
} from "./grid-copy";
import { useGridNav } from "./use-grid-nav";

export type CalendarMonthGridProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  onOpen?(id: string): void;
  onMove?(item: CalItem, date: string): void;
};

const ITEMS_PER_CELL = 3;
const GRID_WEEKS = 6;

/** The month's cells padded to the 6 weeks the range always covers. */
function sixWeeks(
  cells: MonthCell<CalItem>[],
  byDate: Map<string, CalItem[]>,
  today: Date,
): MonthCell<CalItem>[] {
  const out = [...cells];
  while (out.length < GRID_WEEKS * 7) {
    const last = out[out.length - 1];
    const date = new Date(
      last.date.getFullYear(),
      last.date.getMonth(),
      last.date.getDate() + 1,
    );
    const key = localDateKey(date);
    out.push({
      key,
      date,
      isCurrentMonth: false,
      isToday: key === localDateKey(today),
      dayNumber: date.getDate(),
      events: byDate.get(key) ?? [],
    });
  }
  return out;
}

/** Visual piece of the Mes vista (FE §4.1, §11). */
export function CalendarMonthGrid({
  range,
  query,
  onOpen,
  onMove,
}: CalendarMonthGridProps) {
  const drag = useCalendarDrag(range.items, range.today);
  const move = onMove ?? drag.move;
  const {
    containerRef: navRef,
    cursor: navCursor,
    onCellKeyDown: navKeyDown,
    goTo: navGoTo,
    openDay: navOpenDay,
  } = useGridNav(range, query);
  const openNewTask = useNewTaskUi((s) => s.openNewTask);
  const dayByDate = useMemo(
    () => new Map(range.days.map((d) => [d.date, d])),
    [range.days],
  );

  const cells = useMemo(() => {
    const byDate = itemsByDate(range.items);
    const today = parseDateKey(range.today);
    const rows = sixWeeks(
      buildMonthCells(
        parseDateKey(`${query.fecha.slice(0, 7)}-01`),
        byDate,
        today,
        localDateKey,
      ),
      byDate,
      today,
    );
    return Array.from({ length: GRID_WEEKS }, (_, w) =>
      rows.slice(w * 7, w * 7 + 7),
    );
  }, [range.items, range.today, query.fecha]);

  const empty = range.items.length === 0;

  return (
    <section
      aria-label="Mes"
      data-slot="calendar-month-grid"
      className="rounded-lg border border-border bg-card"
    >
      <CalendarWeekdayHeader />
      <div
        ref={navRef}
        role="grid"
        aria-label={monthLabel(query.fecha)}
        className="relative"
      >
        {cells.map((week) => (
          <div
            key={week[0].key}
            role="row"
            className="grid grid-cols-7 border-b border-border last:border-b-0"
          >
            {week.map((cell) => {
              const weekend =
                cell.date.getDay() === 0 || cell.date.getDay() === 6;
              const day = dayByDate.get(cell.key);
              const shown = cell.events.slice(0, ITEMS_PER_CELL);
              const more =
                hiddenCount(day, shown.length) ||
                Math.max(0, cell.events.length - shown.length);
              const heading = new Intl.DateTimeFormat("es-MX", {
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(cell.date);
              return (
                <div
                  key={cell.key}
                  role="gridcell"
                  data-cell-date={cell.key}
                  tabIndex={navCursor === cell.key ? 0 : -1}
                  aria-label={`${heading}, ${dayCounts(day)}`}
                  aria-current={cell.isToday ? "date" : undefined}
                  className={cn(
                    "flex min-h-24 min-w-0 flex-col gap-1 border-r border-border p-1 outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    weekend && "bg-muted",
                    !cell.isCurrentMonth && "text-muted-foreground",
                    drag.overDate === cell.key && "bg-accent",
                  )}
                  onKeyDown={(event) => navKeyDown(event, cell.key)}
                  onFocus={(event) => {
                    if (event.target === event.currentTarget) navGoTo(cell.key);
                  }}
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "button,[data-slot=calendar-item-chip]",
                      )
                    )
                      return;
                    openNewTask({ deliveryDate: cell.key }, "calendario");
                  }}
                  {...drag.dropProps(cell.key)}
                >
                  <button
                    type="button"
                    aria-label={OPEN_DAY_LABEL(cell.key)}
                    className={cn(
                      "flex size-6 items-center justify-center self-start rounded-full text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                      cell.isToday &&
                        "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      navOpenDay(cell.key);
                    }}
                  >
                    {cell.dayNumber}
                  </button>
                  {shown.map((item) => (
                    <CalendarItemChip
                      key={item.id}
                      item={item}
                      density="chip"
                      onOpen={onOpen}
                      drag={
                        item.kind === "task" && item.canEdit
                          ? drag.dragProps(item)
                          : undefined
                      }
                      dragging={drag.draggingId === item.id}
                      onMoveDay={
                        item.kind === "task" && item.canEdit
                          ? (delta) =>
                              void move(item, addDays(item.date, delta))
                          : undefined
                      }
                      onPickDay={
                        item.kind === "task" && item.canEdit
                          ? (date) => void move(item, date)
                          : undefined
                      }
                    />
                  ))}
                  <DayCellExtras day={dayByDate.get(cell.key)} compact />
                  {more > 0 ? (
                    <button
                      type="button"
                      className="self-start rounded-sm px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(event) => {
                        event.stopPropagation();
                        navOpenDay(cell.key);
                      }}
                    >
                      {MORE_LABEL(more)}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {empty ? (
        <div className="flex flex-col items-center gap-2 p-4 text-sm text-muted-foreground">
          <p>{EMPTY_RANGE}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              openNewTask({ deliveryDate: query.fecha }, "calendario")
            }
          >
            {EMPTY_DAY_NEW_TASK}
          </Button>
        </div>
      ) : null}
      <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
        {MONTH_HINT}
      </p>
      <div role="status" aria-live="polite" className="sr-only">
        {drag.announcement}
      </div>
    </section>
  );
}
