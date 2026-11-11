/** Proposal change shapes, diff and undo plan (BE §6.3, ADR 0007). Pure and client-safe. Bodies belong to the Phase 3 issue. */
import { notImplemented } from "@/lib/stubs";
import type { AppliedChange, ProposalChange } from "@/lib/types/calendario";

/** Hours a proposal is valid (`expires_at = created_at + 24 h`). */
export const PROPOSAL_TTL_HOURS = 24;
/** Minutes the undo token is valid (D9). */
export const UNDO_WINDOW_MINUTES = 15;
/** Most changes one proposal may carry. */
export const MAX_PROPOSAL_CHANGES = 200;

/** True when the current value no longer equals the change's `before`. */
export function isStale(change: ProposalChange, current: unknown): boolean {
  return notImplemented("isStale", change, current);
}

/** The before/after rows of a proposal as a flat diff, for the table and the chat card. */
export function diffRows(changes: ProposalChange[]): { changeId: string; title: string; before: string | null; after: string }[] {
  return notImplemented("diffRows", changes);
}

/** What undo restores: per applied change, only where the current value still equals `after`. */
export function undoPlan(applied: AppliedChange[], current: Record<string, unknown>): { restore: AppliedChange[]; skipped: { changeId: string; reason: string }[] } {
  return notImplemented("undoPlan", applied, current);
}
