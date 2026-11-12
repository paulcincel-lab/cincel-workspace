"use client";

import { useState, type KeyboardEvent } from "react";

import { RowActionsMenu } from "@/components/widgets/RowActionsMenu";
import type { BoardCardDragProps } from "@/components/tablero/useBoardDrag";
import { cn } from "@/lib/utils";
import { tramoColorClass, tramoColorVar } from "@/lib/tramos/tramo-color";
import type { CalItem, CalTramoRef } from "@/lib/types/calendario";

import { COMPLETED_TAG, MOVE_TO_OTHER_DAY, OVERDUE_TAG } from "./grid-copy";
import { MoveDayDialog } from "./MoveDayDialog";

export type CalendarItemChipProps = {
  item: CalItem;
  density: "chip" | "card" | "block";
  proposal?: "new" | "ghost";
  /** Click or Enter on the chip. */
  onOpen?(id: string): void;
  /** Spread of `useCalendarDrag().dragProps(item)`; a task without permission passes none. */
  drag?: BoardCardDragProps;
  /** Alt+← / Alt+→ and the "Mover a otro día…" menu; given only for a task the viewer may move. */
  onMoveDay?(delta: -1 | 1): void;
  onPickDay?(date: string): void;
  dragging?: boolean;
};

function tramoInput(tramo: CalTramoRef | null) {
  return tramo ? { key: tramo.key ?? "", sortOrder: 0, colorSlot: tramo.colorSlot } : null;
}

/** "10:30" of an ISO time with offset. */
export function timeLabel(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * One task or meeting on the calendar (FE §4): tramo colour, overdue ring,
 * completed greyed, meeting with its time in mono and a left edge in the tramo
 * colour. A task the viewer can move shows a drag cursor and a `⋯` menu.
 */
export function CalendarItemChip({ item, density, proposal, onOpen, drag, onMoveDay, onPickDay, dragging }: CalendarItemChipProps) {
  const [picking, setPicking] = useState(false);
  const isTask = item.kind === "task";
  const overdue = isTask && item.overdue;
  const completed = isTask && item.completed;
  const tramo = tramoInput(item.tramo);
  const movable = isTask && item.canEdit && Boolean(onPickDay);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!onMoveDay || !event.altKey) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      onMoveDay(event.key === "ArrowLeft" ? -1 : 1);
    }
  }

  const label = [
    item.kind === "event" && !item.allDay ? timeLabel(item.start) : null,
    item.title,
    overdue ? OVERDUE_TAG : null,
    completed ? COMPLETED_TAG : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      data-slot="calendar-item-chip"
      data-density={density}
      data-kind={item.kind}
      data-proposal={proposal}
      className={cn(
        "group/row relative flex min-w-0 items-center gap-1 rounded-md text-xs",
        item.kind === "event" ? "border border-l-[3px] border-border bg-card" : "bg-muted",
        density === "block" && "p-2 text-sm",
        density === "card" && "p-1.5",
        density === "chip" && "px-1.5 py-0.5",
        overdue && "ring-[1.5px] ring-inset ring-destructive",
        completed && "opacity-50",
        proposal === "new" && "border border-dashed border-primary",
        proposal === "ghost" && "border border-dashed border-border opacity-60",
        drag?.draggable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-50",
      )}
      style={item.kind === "event" ? { borderLeftColor: tramoColorVar(tramo) } : undefined}
      {...(drag ?? {})}
    >
      {isTask ? <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tramoColorClass(tramo))} /> : null}
      <button
        type="button"
        aria-label={label}
        className="flex min-w-0 flex-1 items-center gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          event.stopPropagation();
          onOpen?.(item.id);
        }}
        onKeyDown={onKeyDown}
      >
        {item.kind === "event" && !item.allDay ? <span className="shrink-0 font-mono text-muted-foreground">{timeLabel(item.start)}</span> : null}
        <span className={cn("truncate", completed && "line-through")}>{item.title}</span>
      </button>
      {movable && isTask ? (
        <>
          <RowActionsMenu rowLabel={item.title} actions={[{ id: "move", label: MOVE_TO_OTHER_DAY, onSelect: () => setPicking(true) }]} />
          {picking ? (
            <MoveDayDialog title={item.title} date={item.date} open onOpenChange={setPicking} onPick={(date) => onPickDay?.(date)} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
