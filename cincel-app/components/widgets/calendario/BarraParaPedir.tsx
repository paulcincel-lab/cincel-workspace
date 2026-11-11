import type { AssistantCalendarContext, Proposal } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type BarraParaPedirProps = {
  context: AssistantCalendarContext;
  examples: string[];
  onProposal?(proposal: Proposal): void;
};

/** The bar to ask the asistente for a change. Markup belongs to Phase 3. */
export function BarraParaPedir({ examples }: BarraParaPedirProps) {
  return <CalendarioStubSection label="Pide algo para tu calendario" titles={examples} />;
}
