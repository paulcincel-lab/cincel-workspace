import type { Proposal } from "@/lib/types/calendario";

import { CalendarioStubSection } from "./stub-section";

export type ProposalCardProps = {
  proposal: Proposal;
  checked: string[];
  variant?: "visual" | "esencial" | "analitico";
  onToggle?(changeId: string): void;
  onApply?(): void;
  onCancel?(): void;
  onEdit?(): void;
};

/** The open proposal as a card or a table with checkboxes. Markup belongs to Phase 3. */
export function ProposalCard({ proposal }: ProposalCardProps) {
  return <CalendarioStubSection label="Propuesta del asistente" titles={[proposal.title, proposal.line]} />;
}
