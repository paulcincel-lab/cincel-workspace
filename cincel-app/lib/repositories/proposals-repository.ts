/**
 * `assistant_proposals` (Calendario BE §3.6, §6.3, ADR 0007). Server-only.
 * Only the owner (`staff_id`) can see, apply or undo a proposal.
 */
import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { notImplemented, stubDefault } from "@/lib/stubs";
import type { AppliedChange, DeferredItem, Proposal, ProposalChange, ProposalKind, ProposalStatus } from "@/lib/types/calendario";

/** Writes the row; `before` values are read inside the same call. */
export async function createProposal(
  user: AuthenticatedUser,
  kind: ProposalKind,
  data: {
    title: string;
    line: string;
    changes: ProposalChange[];
    deferred: DeferredItem[];
    range: { from: string; to: string } | null;
  },
  opts?: { threadId?: string; toolCallId?: string },
): Promise<Proposal> {
  return notImplemented("createProposal", user, kind, data, opts);
}

/** Null for a proposal of another person. */
export async function getProposal(user: AuthenticatedUser, id: string): Promise<Proposal | null> {
  return stubDefault(null, user, id);
}

export async function setProposalStatus(
  id: string,
  status: ProposalStatus,
  patch?: { applied?: AppliedChange[]; undoTokenHash?: string | null; undoExpiresAt?: Date | null },
): Promise<void> {
  return notImplemented("setProposalStatus", id, status, patch);
}

export async function findByUndoToken(user: AuthenticatedUser, undoToken: string): Promise<Proposal | null> {
  return stubDefault(null, user, undoToken);
}

/** Daily cron: `propuesta` past `expires_at` becomes `expirada`; rows older than 90 days are deleted. */
export async function expireProposals(now?: Date): Promise<{ expired: number; deleted: number }> {
  return notImplemented("expireProposals", now);
}
