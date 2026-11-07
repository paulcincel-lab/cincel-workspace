"use client";

import type { RecordTableData } from "@/lib/types/widgets";

/**
 * Cronograma in three styles (redesign FE §4.10.2): the existing
 * `components/cronograma/*` panels for Visual and `table` for Esencial /
 * Analítico (partida, responsable, inicio, fin, duración, % real, % plan,
 * desviación, holgura).
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type CronogramaWidgetProps = { projectId: string; table: RecordTableData };

export function CronogramaWidget(props: CronogramaWidgetProps) {
  void props;
  return null;
}
