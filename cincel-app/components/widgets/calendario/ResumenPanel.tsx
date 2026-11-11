import type { DaySummary, SummaryAction, WeekSummary } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type ResumenPanelProps = {
  summary: DaySummary | WeekSummary;
  onAction?(action: SummaryAction): void;
};

/** Resumen del día o de la semana. Markup belongs to Phase 4. */
export function ResumenPanel({ summary }: ResumenPanelProps) {
  return <CalendarioStubSection label="Resumen" titles={summary.tiles.map((tile) => tile.label)} />;
}
