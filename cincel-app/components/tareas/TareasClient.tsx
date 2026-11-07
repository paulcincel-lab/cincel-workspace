"use client";

import type { TareasQuery } from "@/lib/tareas/query";
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";
import type { CalendarData, StaffOption, TaskBoard } from "@/lib/types/redesign";

export type TareasClientProps = {
  query: TareasQuery;
  initial: { tasks?: TaskListItem[]; board?: TaskBoard; calendar?: CalendarData };
  staff: StaffOption[];
  tramos: WorkflowRef[];
};

/**
 * /tareas client (redesign FE §3.4, §4.5): URL-synced query, views Tablero /
 * Lista / Calendario as `ListPage` specs.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function TareasClient(props: TareasClientProps) {
  void props;
  return null;
}
