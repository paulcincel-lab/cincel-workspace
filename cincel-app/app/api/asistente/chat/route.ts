import { randomUUID } from "node:crypto";

import { type NextRequest, NextResponse } from "next/server";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { z } from "zod";

import { getSession, requireCapabilityUser } from "@/lib/auth/session";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { getLanguageModel, isAssistantConfigured } from "@/lib/assistant/provider";
import { buildAssistantTools } from "@/lib/assistant/tools";
import { buildSystemPrompt } from "@/lib/assistant/prompt";
import {
  logAssistantAction,
  recordActionDecision,
  recordActionOutcome,
  recordProposedAction,
} from "@/lib/assistant/approvals";
import { buildChatTools } from "@/lib/assistant/chat-tools";
import { resolveAssistantContext } from "@/lib/assistant/context";
import {
  applyApprovalResponses,
  denyPendingApprovals,
  loadThreadMessages,
  pendingApprovalRequests,
  sanitizeUserMessage,
  saveThreadMessages,
  upsertOwnedThread,
  type AppliedApproval,
} from "@/lib/assistant/threads";
import { summarizeToolCall } from "@/lib/assistant/tool-summaries";
import { db } from "@/lib/db/client";
import { actionErrorCode, actionErrorText } from "@/lib/errors";

/**
 * `POST /api/asistente/chat` (redesign BE §7.9, §8.10).
 *
 * Body `{ id, message?, approvals?, context }`: the thread lives on the
 * server (client uuid, owner check before any write), the history is loaded
 * from `assistant_messages` (client history is ignored), approval-gated tools
 * use the native approval round trip and are audited in `assistant_actions`.
 *
 * A bare `{ messages }` body (no thread id) is still answered statelessly,
 * as before; no page of the app sends it any more.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAssistantConfigured()) {
    return NextResponse.json(
      { error: "El asistente no está configurado en este servidor." },
      { status: 503 }
    );
  }

  let user: AuthenticatedUser;
  try {
    user = await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid();
  }

  if (isLegacyBody(body)) return legacyChat(user, body.messages);
  return serverThreadChat(request, user, body);
}

// ── Stateless `{ messages }` body ──────────────────────────────────────

function isLegacyBody(body: unknown): body is { messages: UIMessage[] } {
  if (!body || typeof body !== "object") return false;
  const value = body as Record<string, unknown>;
  return Array.isArray(value.messages) && !("context" in value) && !("message" in value) && !("approvals" in value);
}

async function legacyChat(user: AuthenticatedUser, messages: UIMessage[]): Promise<Response> {
  // Tool set varies by the caller's role: read tools + render_chart for
  // everyone, write tools (create_task / assign_task) only for roles that can
  // create / reassign work in the /tareas UI.
  const tools = buildAssistantTools(user);

  const result = streamText({
    model: getLanguageModel(),
    system: buildSystemPrompt({ toolNames: Object.keys(tools), user }),
    messages: await convertToModelMessages(messages),
    tools,
    // Ceiling on tool-call round-trips per user turn — a cost/availability
    // guard, not data safety (write tools re-check capabilities server-side).
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}

// ── Server threads ─────────────────────────────────────────────────────────

const contextSchema = z.object({
  route: z.string().max(2000).default(""),
  projectId: z.string().max(100).optional(),
  taskId: z.string().max(100).optional(),
  personId: z.string().max(100).optional(),
});

const chatBodySchema = z.object({
  id: z.uuid(),
  /** Only the new user message; sanitized to its text parts. */
  message: z.unknown().optional(),
  approvals: z
    .array(z.object({ toolCallId: z.string().min(1).max(200), approved: z.boolean() }))
    .max(20)
    .optional(),
  context: contextSchema.default({ route: "" }),
});

function invalid(): Response {
  return NextResponse.json({ error: actionErrorText("INVALID"), code: "INVALID" }, { status: 400 });
}

/** Thread errors → status + `actionErrorText` copy; null for anything else. */
function threadErrorResponse(err: unknown): Response | null {
  const code = actionErrorCode(err);
  if (code === "FORBIDDEN") {
    return NextResponse.json({ error: actionErrorText("FORBIDDEN"), code }, { status: 403 });
  }
  if (code === "NOT_FOUND") {
    return NextResponse.json({ error: actionErrorText("NOT_FOUND"), code }, { status: 404 });
  }
  if (code === "INVALID") return invalid();
  return null;
}

/** The request id when the request carries one, else a new uuid. */
function traceIdOf(request: Request): string {
  return request.headers.get("x-request-id")?.trim() || randomUUID();
}

function logRouteError(traceId: string, threadId: string, msg: string, err: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      msg,
      trace_id: traceId,
      thread_id: threadId,
      err: err instanceof Error ? err.message : String(err),
    })
  );
}

async function serverThreadChat(request: Request, user: AuthenticatedUser, body: unknown): Promise<Response> {
  const parsed = chatBodySchema.safeParse(body);
  if (!parsed.success) return invalid();
  const { id: threadId, approvals = [] } = parsed.data;
  const staffId = user.member.id;
  const traceId = traceIdOf(request);

  const message = parsed.data.message === undefined ? null : sanitizeUserMessage(parsed.data.message);
  if (parsed.data.message !== undefined && !message) return invalid();
  if (!message && approvals.length === 0) return invalid();

  // Context ids come from the client: resolve them through viewer-scoped reads first.
  const resolved = await resolveAssistantContext(parsed.data.context);

  try {
    await upsertOwnedThread(db, { threadId, staffId, context: resolved.context });
  } catch (err) {
    const response = threadErrorResponse(err);
    if (response) return response;
    throw err;
  }

  let messages = await loadThreadMessages(db, threadId);
  const decisions: AppliedApproval[] = [];

  if (approvals.length > 0) {
    const applied = applyApprovalResponses(messages, approvals);
    messages = applied.messages;
    decisions.push(...applied.applied);
  }

  if (message) {
    // A new message closes any approval request left unanswered (denied).
    const pending = denyPendingApprovals(messages);
    messages = pending.messages;
    decisions.push(...pending.denied);
    if (!messages.some((existing) => existing.id === message.id)) messages = [...messages, message];
  }

  // Approvals only for tool calls the server never asked about: nothing to run.
  if (!message && decisions.length === 0) return invalid();

  const approvedCallIds = new Set<string>();
  for (const decision of decisions) {
    // Idempotent: makes sure the `proposed` row exists before the transition.
    await recordProposedAction(db, {
      threadId,
      staffId,
      toolCallId: decision.toolCallId,
      tool: decision.toolName,
      input: decision.input,
      summary: summarizeToolCall(decision.toolName, decision.input),
    });
    const changed = await recordActionDecision(db, {
      threadId,
      toolCallId: decision.toolCallId,
      approved: decision.approved,
    });
    if (changed) {
      logAssistantAction({
        traceId,
        threadId,
        staffId,
        toolCallId: decision.toolCallId,
        tool: decision.toolName,
        status: decision.approved ? "confirmed" : "cancelled",
      });
    }
    if (decision.approved) approvedCallIds.add(decision.toolCallId);
  }

  // The user's message and decisions are stored before the model runs.
  await saveThreadMessages(db, threadId, messages);

  const { tools, toolApproval } = buildChatTools({
    user,
    threadId,
    resolved,
    approvedCallIds,
    onOutcome: async (outcome) => {
      try {
        const changed = await recordActionOutcome(db, {
          threadId,
          toolCallId: outcome.toolCallId,
          result: outcome.result,
          error: outcome.error,
        });
        if (changed) {
          logAssistantAction({
            traceId,
            threadId,
            staffId,
            toolCallId: outcome.toolCallId,
            tool: outcome.tool,
            status: outcome.error === undefined ? "done" : "failed",
            error: outcome.error,
          });
        }
      } catch (err) {
        logRouteError(traceId, threadId, "assistant.action_outcome_failed", err);
      }
    },
  });

  const result = streamText({
    model: getLanguageModel(),
    system: buildSystemPrompt({ toolNames: Object.keys(tools), user, context: resolved, serverThreads: true }),
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    toolApproval,
    // An approval request ends the step; the next request resumes it.
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: () => randomUUID(),
    onEnd: async ({ messages: finalMessages, responseMessage }) => {
      try {
        await saveThreadMessages(db, threadId, finalMessages);
        for (const pending of pendingApprovalRequests(responseMessage)) {
          const created = await recordProposedAction(db, {
            threadId,
            staffId,
            toolCallId: pending.toolCallId,
            tool: pending.toolName,
            input: pending.input,
            summary: summarizeToolCall(pending.toolName, pending.input),
          });
          if (created) {
            logAssistantAction({
              traceId,
              threadId,
              staffId,
              toolCallId: pending.toolCallId,
              tool: pending.toolName,
              status: "proposed",
            });
          }
        }
      } catch (err) {
        logRouteError(traceId, threadId, "assistant.persist_failed", err);
      }
    },
    onError: (err) => {
      logRouteError(traceId, threadId, "assistant.stream_failed", err);
      return "No pude completar la respuesta. Intenta de nuevo.";
    },
  });
}
