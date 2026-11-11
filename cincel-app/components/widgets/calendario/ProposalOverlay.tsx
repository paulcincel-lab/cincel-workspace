import type { CalendarioRange, Proposal } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type ProposalOverlayProps = {
  proposal: Proposal;
  range?: CalendarioRange;
  checked: string[];
};

/** Draws the open proposal on the calendar body. Markup belongs to Phase 3. */
export function ProposalOverlay({ proposal }: ProposalOverlayProps) {
  return <CalendarioStubSection label="Propuesta del asistente" titles={[proposal.title]} />;
}
