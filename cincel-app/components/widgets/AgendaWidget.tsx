"use client";

import type { AgendaItem } from "@/lib/types/widgets";

/**
 * Agenda in three styles (redesign FE §4.10.1); wraps `UnifiedCalendar` for
 * the week / month grids.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type AgendaWidgetProps = {
  title: string;
  items: AgendaItem[];
  mode: "day" | "week" | "month";
  groupBy?: "day" | "none";
  emptyText?: string;
};

export function AgendaWidget(props: AgendaWidgetProps) {
  void props;
  return null;
}
