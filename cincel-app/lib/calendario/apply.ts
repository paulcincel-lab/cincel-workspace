/** Apply and undo a proposal (BE §6.3, ADR 0007). Server-only. Bodies belong to the Phase 3 issue. */
import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { notImplemented } from "@/lib/stubs";
import type { ApplyProposalResult, UndoProposalResult } from "@/lib/types/calendario";

export async function applyProposal(user: AuthenticatedUser, proposalId: string, changeIds?: string[]): Promise<ApplyProposalResult> {
  return notImplemented("applyProposal", user, proposalId, changeIds);
}

export async function undoProposal(user: AuthenticatedUser, undoToken: string): Promise<UndoProposalResult> {
  return notImplemented("undoProposal", user, undoToken);
}
