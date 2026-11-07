/**
 * Approval audit (redesign BE §8.10): `assistant_actions` rows, unique per
 * `threadId` + `toolCallId`: `proposed` when the approval request streams,
 * `confirmed` / `cancelled` when the response arrives, `done` / `failed` after
 * `execute`.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";

export async function recordProposedAction(
  db: OwnerDb,
  input: { threadId: string; staffId: string; toolCallId: string; tool: string; input: unknown; summary: string },
): Promise<void> {
  return notImplemented("recordProposedAction", db, input);
}

export async function recordActionDecision(
  db: OwnerDb,
  input: { threadId: string; toolCallId: string; approved: boolean },
): Promise<void> {
  return notImplemented("recordActionDecision", db, input);
}

export async function recordActionOutcome(
  db: OwnerDb,
  input: { threadId: string; toolCallId: string; result?: unknown; error?: string },
): Promise<void> {
  return notImplemented("recordActionOutcome", db, input);
}
