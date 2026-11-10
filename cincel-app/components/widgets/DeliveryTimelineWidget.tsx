"use client";

import { useId } from "react";

import type { TimelineDay, TimelineItem, TramoTone } from "@/components/proyectos/projects-portfolio-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/shadcn/popover";
import { cn } from "@/lib/utils";

/**
 * "Próximas entregas" of /proyectos in Visual (#992): an 11-day strip
 * (today … today + 10, project timezone) with one column per day and each
 * project's next delivery on its day, tinted by tramo. Today is marked
 * (`aria-current="date"`). A day with more than `MAX_PER_DAY` deliveries shows
 * the first ones and "+{n} más", which opens the full list in a popover. The
 * grid keeps a 900 px minimum width and scrolls inside the card only. A
 * legend of tramo dots closes the card.
 */
export type DeliveryTimelineWidgetProps = {
  title: string;
  days: TimelineDay[];
  items: TimelineItem[];
  /** "10 – 20 NOV". */
  rangeLabel: string;
  toneOf(key: string | null): TramoTone;
  legend: { key: string; label: string }[];
};

export const MAX_PER_DAY = 3;
export const EMPTY_TIMELINE_TEXT = "Sin entregas en estos días";

const LONG_DAY = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", timeZone: "UTC" });

/** "martes 10" for a `YYYY-MM-DD` day. */
function dayName(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return LONG_DAY.format(new Date(Date.UTC(y, m - 1, d))).replace(",", "");
}

function Item({ item, tone }: { item: TimelineItem; tone: TramoTone }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[10px] p-2 text-[11.5px]" style={{ background: tone.soft }}>
      <span className="truncate font-semibold" style={{ color: tone.ink }} title={item.title}>
        {item.title}
      </span>
      <span className="truncate text-foreground" title={item.projectName}>
        {item.projectName}
      </span>
    </div>
  );
}

export function DeliveryTimelineWidget({ title, days, items, rangeLabel, toneOf, legend }: DeliveryTimelineWidgetProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-slot="delivery-timeline"
      className="anim-in flex min-w-0 flex-col gap-3.5 rounded-[14px] border bg-card px-[22px] py-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{rangeLabel}</span>
      </div>
      {items.length === 0 ? <p className="text-[12.5px] text-muted-foreground">{EMPTY_TIMELINE_TEXT}</p> : null}
      {/* Focusable so the strip can be scrolled with the keyboard on narrow screens. */}
      <div
        role="group"
        aria-label={`${title}, ${rangeLabel}`}
        tabIndex={0}
        className="overflow-x-auto rounded-[10px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        data-slot="delivery-timeline-scroll"
      >
        <div className="grid min-w-[900px] grid-cols-11 gap-x-1.5">
          {days.map((day, index) => {
            const dayItems = items.filter((item) => item.dayIndex === index);
            const shown = dayItems.length > MAX_PER_DAY ? dayItems.slice(0, MAX_PER_DAY) : dayItems;
            const rest = dayItems.length - shown.length;
            return (
              <div key={day.iso} data-day={day.iso} className="flex min-w-0 flex-col gap-2.5">
                <div
                  aria-hidden="true"
                  className={cn(
                    "border-b-2 pb-1.5 text-center font-mono text-[11px] tabular-nums",
                    day.isToday ? "border-destructive text-destructive" : "border-border text-muted-foreground",
                  )}
                >
                  {day.label}
                </div>
                <ul
                  aria-label={dayName(day.iso)}
                  aria-current={day.isToday ? "date" : undefined}
                  className="flex min-w-0 flex-col gap-2.5"
                >
                  {shown.map((item) => (
                    <li key={item.projectId}>
                      <Item item={item} tone={toneOf(item.tramoKey)} />
                    </li>
                  ))}
                  {rest > 0 ? (
                    <li>
                      <Popover>
                        <PopoverTrigger
                          className="w-full rounded-[10px] px-2 py-1 text-left text-[11.5px] font-medium text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          +{rest} más
                        </PopoverTrigger>
                        <PopoverContent className="w-64">
                          <ul aria-label={dayName(day.iso)} className="flex flex-col gap-2">
                            {dayItems.map((item) => (
                              <li key={item.projectId}>
                                <Item item={item} tone={toneOf(item.tramoKey)} />
                              </li>
                            ))}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    </li>
                  ) : null}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      {legend.length > 0 ? (
        <ul aria-label="Tramos" className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
          {legend.map((entry) => (
            <li key={entry.key} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2 rounded-full" style={{ background: toneOf(entry.key).color }} />
              {entry.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
