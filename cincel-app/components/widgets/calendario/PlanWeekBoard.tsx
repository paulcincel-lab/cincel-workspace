import type { PlanWeekData, Proposal } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type PlanWeekBoardProps = { data: PlanWeekData; proposal?: Proposal; onPlan?(): void };

/** Planear mi semana. Markup belongs to Phase 7. */
export function PlanWeekBoard({ data }: PlanWeekBoardProps) {
  return <CalendarioStubSection label="Planear mi semana" titles={data.backlog.map((task) => task.title)} />;
}
