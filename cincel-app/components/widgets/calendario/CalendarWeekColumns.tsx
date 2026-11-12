"use client";

import { useMemo } from "react";

import { useCalendarDrag } from "@/components/calendario/use-calendar-drag";
import { Button } from "@/components/ui/shadcn/button";
import {
  columnHeading,
  dayCounts,
  dayAndNumber,
  hiddenCount,
  itemsByDate,
  longDayLabel,
  monthLabel,
} from "@/lib/calendario/move";
import { addDays, weekDates } from "@/lib/time-tracking/local-time";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import type {
  CalItem,
  CalendarioQuery,
  CalendarioRange,
} from "@/lib/types/calendario";
import { cn } from "@/lib/utils";
import { weekBounds } from "@/lib/calendario/move";

import { CalendarItemChip } from "./CalendarItemChip";
import { DayAssistantButton } from "./DayAssistantButton";
import { DayCellExtras } from "./DayCellExtras";
import {
  ASK_ASSISTANT_LABEL,
  ASSISTANT_LABEL,
  EMPTY_DAY_NEW_TASK,
  EMPTY_RANGE,
  MORE_LABEL,
  WEEK_SCROLL_HINT,
} from "./grid-copy";
import { useGridNav } from "./use-grid-nav";

export type CalendarWeekColumnsProps = {
  range: CalendarioRange;
  query: CalendarioQuery;
  onOpen?(id: string): void;
  onMove?(item: CalItem, date: string): void;
  /** Opens the asistente for a day; defaults to opening the panel with that `selectedDate`. */
  onAsk?(date: string): void;
};

const ITEMS_PER_COLUMN = 12;

/** Visual piece of the Semana vista (FE §4.1, §11). */
export function CalendarWeekColumns({
  range,
  query,
  onOpen,
  onMove,
  onAsk,
}: CalendarWeekColumnsProps) {
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
  const byDate = useMemo(() => itemsByDate(range.items), [range.items]);
  const dates = useMemo(
    () => weekDates(weekBounds(query.fecha).start),
    [query.fecha],
  );

  const empty = range.items.length === 0;

  return (
    <section
      aria-label="Semana"
      data-slot="calendar-week-columns"
      className="rounded-lg border border-border bg-card"
    >
      <p className="px-3 pt-2 text-xs text-muted-foreground md:hidden">
        {WEEK_SCROLL_HINT}
      </p>
      <div
        role="region"
        aria-label={`Semana de ${longDayLabel(dates[0])}`}
        tabIndex={0}
        className="overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div
          ref={navRef}
          role="grid"
          aria-label={monthLabel(dates[0])}
          className="min-w-[56rem]"
        >
          <div role="row" className="grid grid-cols-7">
            {dates.map((date) => {
              const day = dayByDate.get(date);
              const items = byDate.get(date) ?? [];
              const shown = items.slice(0, ITEMS_PER_COLUMN);
              const more =
                hiddenCount(day, shown.length) ||
                Math.max(0, items.length - shown.length);
              const isToday = date === range.today;
              const weekend = [0, 6].includes(
                new Date(`${date}T00:00:00Z`).getUTCDay(),
              );
              return (
                <div
                  key={date}
                  role="gridcell"
                  data-cell-date={date}
                  tabIndex={navCursor === date ? 0 : -1}
                  aria-label={`${longDayLabel(date)}, ${dayCounts(day)}`}
                  aria-current={isToday ? "date" : undefined}
                  className={cn(
                    "flex min-h-48 min-w-0 flex-col gap-1 border-r border-border p-2 outline-none last:border-r-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    weekend && "bg-muted",
                    drag.overDate === date && "bg-accent",
                  )}
                  onKeyDown={(event) => navKeyDown(event, date)}
                  onFocus={(event) => {
                    if (event.target === event.currentTarget) navGoTo(date);
                  }}
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "button,[data-slot=calendar-item-chip]",
                      )
                    )
                      return;
                    openNewTask({ deliveryDate: date }, "calendario");
                  }}
                  {...drag.dropProps(date)}
                >
                  <button
                    type="button"
                    aria-label={`Abrir el ${dayAndNumber(date)}`}
                    className={cn(
                      "self-start rounded-md px-1.5 py-0.5 text-xs font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                      isToday &&
                        "bg-primary text-primary-foreground hover:bg-primary",
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      navOpenDay(date);
                    }}
                  >
                    {columnHeading(date)}
                  </button>
                  {shown.map((item) => (
                    <CalendarItemChip
                      key={item.id}
                      item={item}
                      density="card"
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
                          ? (next) => void move(item, next)
                          : undefined
                      }
                    />
                  ))}
                  {more > 0 ? (
                    <button
                      type="button"
                      className="self-start rounded-sm px-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={(event) => {
                        event.stopPropagation();
                        navOpenDay(date);
                      }}
                    >
                      {MORE_LABEL(more)}
                    </button>
                  ) : null}
                  <DayCellExtras day={day} />
                  <div className="mt-auto pt-2" onClick={(event) => event.stopPropagation()}>
                    {onAsk ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full border-dashed"
                        aria-label={ASK_ASSISTANT_LABEL(date)}
                        onClick={() => onAsk(date)}
                      >
                        {ASSISTANT_LABEL}
                      </Button>
                    ) : (
                      <DayAssistantButton date={date} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {empty ? (
        <div className="flex flex-col items-center gap-2 border-t border-border p-4 text-sm text-muted-foreground">
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
      <div role="status" aria-live="polite" className="sr-only">
        {drag.announcement}
      </div>
    </section>
  );
}
