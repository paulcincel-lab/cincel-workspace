/**
 * Server-side threads (redesign BE §8.10): ownership verified before any
 * upsert (another owner → 403), messages upserted by `(thread_id, id)`,
 * history loaded from the database (client history ignored), title from the
 * first user message. Also the untrusted-content helpers of review N4: tool
 * results that carry third-party text are stored as `{ untrusted: true,
 * content }`, and a turn that read one makes every write tool ask first.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import type { ModelMessage, UIMessage } from "ai";

import { assistantMessages, assistantThreads } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import type { AssistantContext } from "@/lib/types/redesign";

/** The column default of `assistant_threads.title`. */
export const DEFAULT_THREAD_TITLE = "Nueva conversación";

const TITLE_MAX = 80;
const MESSAGE_ID_MAX = 200;
const USER_TEXT_MAX = 20_000;

/**
 * Creates the thread when new and refreshes its context when it is the
 * caller's. Throws `FORBIDDEN` when the id belongs to another staff member
 * (nothing is written) and `NOT_FOUND` when the caller deleted it.
 */
export async function upsertOwnedThread(
  db: OwnerDb,
  input: { threadId: string; staffId: string; context: AssistantContext },
): Promise<{ created: boolean }> {
  const existing = await readThreadOwner(db, input.threadId);
  if (existing) return touchOwnedThread(db, existing, input);

  const inserted = await db
    .insert(assistantThreads)
    .values({ id: input.threadId, staffId: input.staffId, context: input.context })
    .onConflictDoNothing({ target: assistantThreads.id })
    .returning({ id: assistantThreads.id });
  if (inserted.length > 0) return { created: true };

  // Lost a race with another request for the same id: check who won.
  const winner = await readThreadOwner(db, input.threadId);
  if (!winner) throw new Error("NOT_FOUND: assistant thread");
  return touchOwnedThread(db, winner, input);
}

async function readThreadOwner(
  db: OwnerDb,
  threadId: string,
): Promise<{ staffId: string; deletedAt: Date | null } | null> {
  const [row] = await db
    .select({ staffId: assistantThreads.staffId, deletedAt: assistantThreads.deletedAt })
    .from(assistantThreads)
    .where(eq(assistantThreads.id, threadId))
    .limit(1);
  return row ?? null;
}

async function touchOwnedThread(
  db: OwnerDb,
  owner: { staffId: string; deletedAt: Date | null },
  input: { threadId: string; staffId: string; context: AssistantContext },
): Promise<{ created: boolean }> {
  if (owner.staffId !== input.staffId) throw new Error("FORBIDDEN: assistant thread");
  if (owner.deletedAt) throw new Error("NOT_FOUND: assistant thread");
  await db
    .update(assistantThreads)
    .set({ context: input.context, updatedAt: new Date() })
    .where(and(eq(assistantThreads.id, input.threadId), eq(assistantThreads.staffId, input.staffId)));
  return { created: false };
}

/** The stored messages of a thread, oldest first. Call after `upsertOwnedThread`. */
export async function loadThreadMessages(db: OwnerDb, threadId: string): Promise<UIMessage[]> {
  const rows = await db
    .select({ id: assistantMessages.id, role: assistantMessages.role, parts: assistantMessages.parts })
    .from(assistantMessages)
    .where(eq(assistantMessages.threadId, threadId))
    .orderBy(asc(assistantMessages.createdAt), asc(assistantMessages.id));
  return rows
    .filter((row) => row.role !== "tool")
    .map((row) => ({
      id: row.id,
      role: row.role as UIMessage["role"],
      parts: (Array.isArray(row.parts) ? row.parts : []) as UIMessage["parts"],
    }));
}

/**
 * Upserts the messages by `(thread_id, id)` (new rows keep the list order,
 * existing rows get their parts replaced), sets the title from the first user
 * message while the thread still has the default one, and bumps `updated_at`.
 */
export async function saveThreadMessages(db: OwnerDb, threadId: string, messages: UIMessage[]): Promise<void> {
  const storable = messages.filter(
    (message) =>
      typeof message.id === "string" &&
      message.id.length > 0 &&
      (message.role === "user" || message.role === "assistant" || message.role === "system"),
  );
  if (storable.length > 0) {
    const base = Date.now();
    await db
      .insert(assistantMessages)
      .values(
        storable.map((message, index) => ({
          id: message.id,
          threadId,
          role: message.role,
          parts: message.parts as unknown[],
          createdAt: new Date(base + index),
        })),
      )
      .onConflictDoUpdate({
        target: [assistantMessages.threadId, assistantMessages.id],
        set: { parts: sql`excluded.parts`, role: sql`excluded.role` },
      });
  }

  await db.update(assistantThreads).set({ updatedAt: new Date() }).where(eq(assistantThreads.id, threadId));
  const title = threadTitleFrom(messages);
  if (title) {
    await db
      .update(assistantThreads)
      .set({ title })
      .where(and(eq(assistantThreads.id, threadId), eq(assistantThreads.title, DEFAULT_THREAD_TITLE)));
  }
}

/** The first user message's text, one line, at most 80 characters; null without one. */
export function threadTitleFrom(messages: readonly UIMessage[]): string | null {
  const first = messages.find((message) => message.role === "user");
  if (!first) return null;
  const text = first.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
}

/**
 * The new user message as the route accepts it: role `user` and text parts
 * only. Tool parts, files and data parts a client sends are dropped, so a
 * forged tool result can never reach the history. Null when nothing is left.
 */
export function sanitizeUserMessage(raw: unknown): UIMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { id?: unknown; role?: unknown; parts?: unknown };
  if (candidate.role !== "user") return null;
  if (typeof candidate.id !== "string") return null;
  const id = candidate.id.trim();
  if (!id || id.length > MESSAGE_ID_MAX) return null;
  if (!Array.isArray(candidate.parts)) return null;

  const parts: UIMessage["parts"] = [];
  for (const part of candidate.parts) {
    if (!part || typeof part !== "object") continue;
    const { type, text } = part as { type?: unknown; text?: unknown };
    if (type !== "text" || typeof text !== "string") continue;
    const trimmed = text.trim();
    if (!trimmed) continue;
    parts.push({ type: "text", text: trimmed.slice(0, USER_TEXT_MAX) });
  }
  if (parts.length === 0) return null;
  return { id, role: "user", parts };
}

// ── Approval responses on the stored history ───────────────────────────────

export type ApprovalResponse = { toolCallId: string; approved: boolean };

export type AppliedApproval = { toolCallId: string; toolName: string; input: unknown; approved: boolean };

type ToolPartLike = {
  type: string;
  toolName?: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  approval?: { id: string; approved?: boolean; reason?: string; isAutomatic?: boolean; [key: string]: unknown };
};

function asToolPart(part: unknown): ToolPartLike | null {
  if (!part || typeof part !== "object") return null;
  const candidate = part as Partial<ToolPartLike>;
  if (typeof candidate.type !== "string") return null;
  if (!candidate.type.startsWith("tool-") && candidate.type !== "dynamic-tool") return null;
  if (typeof candidate.toolCallId !== "string" || typeof candidate.state !== "string") return null;
  return candidate as ToolPartLike;
}

function toolNameOf(part: ToolPartLike): string {
  return part.type === "dynamic-tool" ? (part.toolName ?? "") : part.type.slice("tool-".length);
}

/**
 * Applies the client's approval responses to the stored history: only a part
 * the server streamed in state `approval-requested` changes (to
 * `approval-responded`); responses for unknown or already answered tool calls
 * are ignored.
 */
export function applyApprovalResponses(
  messages: readonly UIMessage[],
  approvals: readonly ApprovalResponse[],
): { messages: UIMessage[]; applied: AppliedApproval[] } {
  const decisions = new Map<string, boolean>();
  for (const approval of approvals) decisions.set(approval.toolCallId, approval.approved);
  const applied: AppliedApproval[] = [];

  const next = messages.map((message) => {
    if (message.role !== "assistant") return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      const tool = asToolPart(part);
      if (!tool || tool.state !== "approval-requested" || !tool.approval) return part;
      const approved = decisions.get(tool.toolCallId);
      if (approved === undefined) return part;
      changed = true;
      applied.push({ toolCallId: tool.toolCallId, toolName: toolNameOf(tool), input: tool.input, approved });
      return {
        ...tool,
        state: "approval-responded",
        approval: { ...tool.approval, approved },
      } as unknown as typeof part;
    });
    return changed ? { ...message, parts } : message;
  });

  return { messages: next, applied };
}

/** Copy the model receives for an approval the user never answered. */
export const UNANSWERED_APPROVAL_REASON = "El usuario no respondió a la confirmación y escribió un mensaje nuevo.";

/**
 * Closes approval requests left unanswered when the user writes a new
 * message instead: they become denied (`output-denied`), so the history the
 * model sees has a result for every tool call.
 */
export function denyPendingApprovals(messages: readonly UIMessage[]): {
  messages: UIMessage[];
  denied: AppliedApproval[];
} {
  const denied: AppliedApproval[] = [];
  const next = messages.map((message) => {
    if (message.role !== "assistant") return message;
    let changed = false;
    const parts = message.parts.map((part) => {
      const tool = asToolPart(part);
      if (!tool || tool.state !== "approval-requested" || !tool.approval) return part;
      changed = true;
      denied.push({ toolCallId: tool.toolCallId, toolName: toolNameOf(tool), input: tool.input, approved: false });
      return {
        ...tool,
        state: "output-denied",
        approval: { ...tool.approval, approved: false, reason: UNANSWERED_APPROVAL_REASON },
      } as unknown as typeof part;
    });
    return changed ? { ...message, parts } : message;
  });
  return { messages: next, denied };
}

/** Manual approval requests the server streamed in this message. */
export function pendingApprovalRequests(
  message: UIMessage,
): { toolCallId: string; toolName: string; input: unknown }[] {
  const pending: { toolCallId: string; toolName: string; input: unknown }[] = [];
  for (const part of message.parts) {
    const tool = asToolPart(part);
    if (!tool || tool.state !== "approval-requested" || !tool.approval) continue;
    if (tool.approval.isAutomatic === true) continue;
    pending.push({ toolCallId: tool.toolCallId, toolName: toolNameOf(tool), input: tool.input });
  }
  return pending;
}

// ── Untrusted content (review N4) ──────────────────────────────────────────

/**
 * Tools whose results carry third-party text (mail, chats, documents,
 * attachments): their results are stored as `{ untrusted: true, content }`.
 */
export const UNTRUSTED_RESULT_TOOLS: ReadonlySet<string> = new Set([
  "search_email",
  "summarize_email_thread",
  "read_conversation",
  "summarize_channel",
  "measure_areas_from_plan",
  "moodboard_from_references",
]);

export type UntrustedResult<T = unknown> = { untrusted: true; content: T };

export function isUntrustedResult(value: unknown): value is UntrustedResult {
  return typeof value === "object" && value !== null && (value as { untrusted?: unknown }).untrusted === true;
}

/** Wraps a third-party result once; an already wrapped result is returned as is. */
export function markUntrusted<T>(content: T): UntrustedResult<T> | T {
  if (isUntrustedResult(content)) return content;
  return { untrusted: true, content };
}

/**
 * True when the current turn (everything after the last user message)
 * already contains a tool result marked untrusted.
 */
export function turnHasUntrustedResult(messages: readonly ModelMessage[]): boolean {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      start = i + 1;
      break;
    }
  }
  for (const message of messages.slice(start)) {
    if (message.role !== "tool" || !Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;
      const output = part.output as { type?: string; value?: unknown } | undefined;
      if (output?.type === "json" && isUntrustedResult(output.value)) return true;
    }
  }
  return false;
}
