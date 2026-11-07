"use client";

import type { TaskListItem } from "@/lib/types/core";

export type ProjectTasksByFaseProps = { projectId: string; tasks: TaskListItem[] };

/**
 * Proyecto · Tareas (redesign FE §3.5): tasks grouped by fase / partida
 * (tramo when no fase catalog) through a grouped `RecordTable`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function ProjectTasksByFase(props: ProjectTasksByFaseProps) {
  void props;
  return null;
}
