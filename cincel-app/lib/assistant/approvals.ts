/**
 * Approval audit (redesign BE §8.10): `assistant_actions` rows, unique per
 * `threadId` + `toolCallId`: `proposed` when the approval request streams,
 * `confirmed` / `cancelled` when the response arrives, `done` / `failed` after
 * `execute`. Each step also emits one JSON log line `assistant.action` with
 * the request's `trace_id`. The approval policy of the chat route
 * (`needsApproval`, plus the dynamic rule after untrusted content, BE §10.1)
 * lives here too.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { ModelMessage, ToolApprovalStatus, ToolSet } from "ai";

import { turnHasUntrustedResult } from "@/lib/assistant/threads";
import { assistantActions } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import type { AssistantActionStatus } from "@/lib/types/redesign";

/** Inserts the `proposed` row; a repeat for the same tool call is a no-op. */
export async function recordProposedAction(
  db: OwnerDb,
  input: { threadId: string; staffId: string; toolCallId: string; tool: string; input: unknown; summary: string },
): Promise<boolean> {
  const rows = await db
    .insert(assistantActions)
    .values({
      threadId: input.threadId,
      staffId: input.staffId,
      toolCallId: input.toolCallId,
      tool: input.tool,
      input: (input.input ?? {}) as object,
      summary: input.summary,
      status: "proposed",
    })
    .onConflictDoNothing({ target: [assistantActions.threadId, assistantActions.toolCallId] })
    .returning({ id: assistantActions.id });
  return rows.length > 0;
}

/** `proposed` → `confirmed` / `cancelled`. Any other current status is left alone (false). */
export async function recordActionDecision(
  db: OwnerDb,
  input: { threadId: string; toolCallId: string; approved: boolean },
): Promise<boolean> {
  const rows = await db
    .update(assistantActions)
    .set({ status: input.approved ? "confirmed" : "cancelled", decidedAt: new Date() })
    .where(
      and(
        eq(assistantActions.threadId, input.threadId),
        eq(assistantActions.toolCallId, input.toolCallId),
        eq(assistantActions.status, "proposed"),
      ),
    )
    .returning({ id: assistantActions.id });
  return rows.length > 0;
}

/**
 * `recordProposedAction` for several tool calls of one turn in one insert.
 * Returns the tool call ids whose `proposed` row was created now (repeats are
 * no-ops and left out).
 */
export async function recordProposedActions(
  db: OwnerDb,
  rows: readonly { threadId: string; staffId: string; toolCallId: string; tool: string; input: unknown; summary: string }[],
): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const inserted = await db
    .insert(assistantActions)
    .values(
      rows.map((row) => ({
        threadId: row.threadId,
        staffId: row.staffId,
        toolCallId: row.toolCallId,
        tool: row.tool,
        input: (row.input ?? {}) as object,
        summary: row.summary,
        status: "proposed" as const,
      })),
    )
    .onConflictDoNothing({ target: [assistantActions.threadId, assistantActions.toolCallId] })
    .returning({ toolCallId: assistantActions.toolCallId });
  return new Set(inserted.map((row) => row.toolCallId));
}

/**
 * `recordActionDecision` for several tool calls of one thread: one update per
 * outcome (confirmed, cancelled). Only `proposed` rows change; returns the
 * tool call ids that did.
 */
export async function recordActionDecisions(
  db: OwnerDb,
  input: { threadId: string; decisions: readonly { toolCallId: string; approved: boolean }[] },
): Promise<Set<string>> {
  const changed = new Set<string>();
  const decidedAt = new Date();
  for (const approved of [true, false]) {
    const ids = input.decisions.filter((d) => d.approved === approved).map((d) => d.toolCallId);
    if (ids.length === 0) continue;
    const rows = await db
      .update(assistantActions)
      .set({ status: approved ? "confirmed" : "cancelled", decidedAt })
      .where(
        and(
          eq(assistantActions.threadId, input.threadId),
          inArray(assistantActions.toolCallId, ids),
          eq(assistantActions.status, "proposed"),
        ),
      )
      .returning({ toolCallId: assistantActions.toolCallId });
    for (const row of rows) changed.add(row.toolCallId);
  }
  return changed;
}

/** `confirmed` → `done` (with the result) or `failed` (with the error). Other statuses: no-op (false). */
export async function recordActionOutcome(
  db: OwnerDb,
  input: { threadId: string; toolCallId: string; result?: unknown; error?: string },
): Promise<boolean> {
  const failed = typeof input.error === "string";
  const rows = await db
    .update(assistantActions)
    .set({
      status: failed ? "failed" : "done",
      result: failed ? null : toJson(input.result),
      error: failed ? input.error!.slice(0, 2000) : null,
    })
    .where(
      and(
        eq(assistantActions.threadId, input.threadId),
        eq(assistantActions.toolCallId, input.toolCallId),
        eq(assistantActions.status, "confirmed"),
      ),
    )
    .returning({ id: assistantActions.id });
  return rows.length > 0;
}

function toJson(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/** One JSON line per audit step of an approval-gated call. Inputs and results are never logged. */
export function logAssistantAction(entry: {
  traceId: string;
  threadId: string;
  staffId: string;
  toolCallId: string;
  tool: string;
  status: AssistantActionStatus;
  error?: string;
}): void {
  const line = {
    level: entry.status === "failed" ? "warn" : "info",
    msg: "assistant.action",
    trace_id: entry.traceId,
    thread_id: entry.threadId,
    staff_id: entry.staffId,
    tool_call_id: entry.toolCallId,
    tool: entry.tool,
    status: entry.status,
    ...(entry.error ? { error: entry.error } : {}),
  };
  if (entry.status === "failed") console.warn(JSON.stringify(line));
  else console.info(JSON.stringify(line));
}

/**
 * A tool result that reports a failure instead of throwing: `{ ok: false }`
 * (existing tools and `defineTool`) → its message / error code; else null.
 */
export function toolFailureOf(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const value = result as { ok?: unknown; message?: unknown; error?: unknown };
  if (value.ok !== false) return null;
  if (typeof value.message === "string" && value.message) return value.message;
  if (typeof value.error === "string" && value.error) return value.error;
  return "ERROR";
}

// ── Approval policy (BE §10.1) ─────────────────────────────────────────────

/**
 * The existing write / destructive tools marked **Confirmar** in BE §10.2:
 * through the chat route they always ask the user first.
 */
export const LEGACY_CONFIRM_TOOLS: ReadonlySet<string> = new Set([
  "create_task",
  "assign_task",
  "create_client",
  "onboard_client",
  "create_rfc",
  "create_ticket",
  "merge_duplicate_clients",
  "merge_duplicate_activities",
  "discard_project",
]);

/** Why a normally direct write asks for approval (shown on the request). */
export const UNTRUSTED_APPROVAL_REASON =
  "Esta acción se basa en contenido externo (correo, documentos o adjuntos); confirma antes de ejecutarla.";

export type ApprovalPolicy = {
  /** Tools that always ask (Confirmar). */
  confirm: ReadonlySet<string>;
  /** Write tools: ask when the turn already read untrusted content. */
  write: ReadonlySet<string>;
};

/**
 * The route's `toolApproval`: Confirmar tools always ask; write tools ask
 * after an untrusted result in the current turn; otherwise the tool's own
 * `needsApproval` (boolean or function) decides.
 */
export type ChatToolApproval = (options: {
  toolCall: { toolName: string; toolCallId: string; input: unknown };
  messages: ModelMessage[];
}) => Promise<ToolApprovalStatus>;

export function buildToolApproval(tools: ToolSet, policy: ApprovalPolicy): ChatToolApproval {
  return async ({ toolCall, messages }) =>
    approvalStatusFor({
      toolName: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      input: toolCall.input,
      messages,
      tools,
      policy,
    });
}

export async function approvalStatusFor(args: {
  toolName: string;
  toolCallId: string;
  input: unknown;
  messages: ModelMessage[];
  tools: ToolSet;
  policy: ApprovalPolicy;
}): Promise<ToolApprovalStatus> {
  const { toolName, policy } = args;
  if (policy.confirm.has(toolName)) return "user-approval";
  if (policy.write.has(toolName) && turnHasUntrustedResult(args.messages)) {
    return { type: "user-approval", reason: UNTRUSTED_APPROVAL_REASON };
  }
  const own = (args.tools[toolName] as { needsApproval?: unknown } | undefined)?.needsApproval;
  if (own === true) return "user-approval";
  if (typeof own === "function") {
    const needs = await (own as (input: unknown, options: unknown) => unknown)(args.input, {
      toolCallId: args.toolCallId,
      messages: args.messages,
      context: undefined,
    });
    if (needs === true) return "user-approval";
  }
  return undefined;
}
