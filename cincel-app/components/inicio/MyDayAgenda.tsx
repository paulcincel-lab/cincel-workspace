"use client";

import type { AgendaItem } from "@/lib/types/widgets";

export type MyDayAgendaProps = { items: AgendaItem[] };

/**
 * "Mi día" (redesign FE §4.3): an instance of `AgendaWidget` (mode day).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function MyDayAgenda(props: MyDayAgendaProps) {
  void props;
  return null;
}
