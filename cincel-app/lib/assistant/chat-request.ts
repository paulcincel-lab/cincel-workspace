/**
 * Request body for `POST /api/asistente/chat` (redesign BE §8.10, FE §3.9):
 * `{ id, message?, approvals?, context }`. The server loads the history from
 * the database, so the client sends only the new user message, or the
 * approval responses of the last assistant message, never the full history.
 * Pure and client-safe.
 */
import type { UIMessage } from "ai";

import type { AssistantContext } from "@/lib/types/redesign";

export type AssistantApprovalResponse = { toolCallId: string; approved: boolean };

export type AssistantChatRequestBody = {
  id: string;
  message?: UIMessage;
  approvals?: AssistantApprovalResponse[];
  context: AssistantContext;
};

type ToolLikePart = {
  type: string;
  toolCallId?: string;
  state?: string;
  approval?: { id: string; approved?: boolean };
};

function isToolPart(part: { type: string }): part is ToolLikePart {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

/** Approval responses the user gave on a message that the server has not seen yet. */
export function pendingApprovalResponses(message: UIMessage | undefined): AssistantApprovalResponse[] {
  if (!message || message.role !== "assistant") return [];
  const out: AssistantApprovalResponse[] = [];
  for (const part of message.parts as ToolLikePart[]) {
    if (!isToolPart(part)) continue;
    if (part.state !== "approval-responded" || !part.toolCallId || typeof part.approval?.approved !== "boolean") continue;
    out.push({ toolCallId: part.toolCallId, approved: part.approval.approved });
  }
  return out;
}

export function buildAssistantChatRequestBody(input: {
  id: string;
  messages: UIMessage[];
  context: AssistantContext;
}): AssistantChatRequestBody {
  const last = input.messages[input.messages.length - 1];
  if (last && last.role === "assistant") {
    return { id: input.id, approvals: pendingApprovalResponses(last), context: input.context };
  }
  return last ? { id: input.id, message: last, context: input.context } : { id: input.id, context: input.context };
}
