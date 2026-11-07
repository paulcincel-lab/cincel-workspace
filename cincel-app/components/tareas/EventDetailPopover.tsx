"use client";

import type { CalendarItem } from "@/lib/types/redesign";

export type EventDetailPopoverProps = { event: CalendarItem; anchor: HTMLElement; onClose(): void };

/**
 * Calendar event detail (redesign FE §3.4): extends the `UnifiedCalendar`
 * popover.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function EventDetailPopover(props: EventDetailPopoverProps) {
  void props;
  return null;
}
