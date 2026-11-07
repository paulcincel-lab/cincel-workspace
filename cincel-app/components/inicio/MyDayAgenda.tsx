"use client";

import { AgendaWidget } from "@/components/widgets/AgendaWidget";
import type { AgendaItem } from "@/lib/types/widgets";

export type MyDayAgendaProps = { items: AgendaItem[] };

/**
 * "Mi día" (redesign FE §3.2, §4.3): an instance of `AgendaWidget` (mode day)
 * with events, tasks due today and the caller's reminders. Empty until
 * reminders and events exist; the widget shows its empty line.
 */
export function MyDayAgenda({ items }: MyDayAgendaProps) {
  return <AgendaWidget title="Mi día" items={items} mode="day" groupBy="none" emptyText="Sin revisiones en los próximos 7 días" />;
}
