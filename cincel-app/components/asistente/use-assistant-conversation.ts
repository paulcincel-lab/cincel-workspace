"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithApprovalResponses, type ChatStatus, type FileUIPart, type UIMessage } from "ai";

import { AssistantContextStore, createAssistantChatTransport } from "@/components/asistente/assistant-transport";
import type { AssistantTurn } from "@/components/asistente/use-asistente-cache";
import type { AssistantUIMessage } from "@/lib/types/asistente";
import type { AssistantContext } from "@/lib/types/redesign";

/**
 * One server-thread conversation of the full `/asistente` page, without
 * markup: `useChat` on `POST /api/asistente/chat`, the page context sent with
 * each request, the approval answers and the error copy. Each style's layout
 * places the log and the composer itself. Mount it keyed by the thread id:
 * the seed messages are read once.
 */
export type UseAssistantConversationOptions = {
  thread: { id: string; messages: UIMessage[] };
  /** The context of the next request (route plus chips); read at send time, so a change applies to the next message. */
  context: AssistantContext;
  /** After each finished turn with the final message (the page updates `qk.asistente.*` and the tool keys). */
  onTurnFinished?(turn: AssistantTurn): void;
};

export type AssistantSendInput = { text?: string; files?: FileUIPart[] };

export type AssistantConversation = {
  messages: AssistantUIMessage[];
  status: ChatStatus;
  /** Submitted or streaming: the send button stays disabled. */
  busy: boolean;
  error: string | null;
  clearError(): void;
  /**
   * Sends a user message. Pending approvals of the last message are denied
   * first (reason "nuevo mensaje"), so the thread never keeps a stale
   * proposal. False when there is nothing to send or a turn is running.
   */
  send(input: AssistantSendInput): boolean;
  /** Answers every approval id of a grouped confirmation once. */
  approve(approvalIds: readonly string[], approved: boolean, reason?: string): void;
  /** Approval ids of the last assistant message still waiting for an answer. */
  pendingApprovalIds: string[];
};

export const ASSISTANT_PAGE_CHAT_API = "/api/asistente/chat";
export const ASSISTANT_ERROR_TEXT =
  "No se pudo obtener una respuesta del asistente. Verifica que esté configurado e intenta de nuevo.";
/** Reason stored on approvals left unanswered when the user writes a new message. */
export const NEW_MESSAGE_DENIAL_REASON = "nuevo mensaje";

type ApprovalLikePart = {
  type: string;
  state?: string;
  approval?: { id: string; approved?: boolean; reason?: string };
};

function isToolPart(part: { type: string }): boolean {
  return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

/** Approval ids still `approval-requested` in the last assistant message. */
export function pendingApprovalIdsOf(messages: readonly UIMessage[]): string[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return [];
  const ids: string[] = [];
  for (const part of last.parts as ApprovalLikePart[]) {
    if (isToolPart(part) && part.state === "approval-requested" && part.approval?.id) ids.push(part.approval.id);
  }
  return ids;
}

/** The last assistant message with its pending approvals denied (the card shows "Cancelado"). */
export function denyPendingInLast<M extends UIMessage>(messages: readonly M[], reason: string): M[] {
  const lastIndex = messages.length - 1;
  const last = messages[lastIndex];
  if (!last || last.role !== "assistant") return [...messages];
  const parts = (last.parts as ApprovalLikePart[]).map((part) =>
    isToolPart(part) && part.state === "approval-requested" && part.approval
      ? { ...part, state: "approval-responded", approval: { ...part.approval, approved: false, reason } }
      : part,
  );
  return [...messages.slice(0, lastIndex), { ...last, parts } as unknown as M];
}

export function useAssistantConversation({
  thread,
  context,
  onTurnFinished,
}: UseAssistantConversationOptions): AssistantConversation {
  const threadId = thread.id;
  const [error, setError] = useState<string | null>(null);
  const [contextStore] = useState(() => new AssistantContextStore(context));
  const onTurnFinishedRef = useRef(onTurnFinished);

  // The transport reads the store at send time, so a chip change applies to the next message.
  useEffect(() => {
    contextStore.set(context);
    onTurnFinishedRef.current = onTurnFinished;
  }, [context, contextStore, onTurnFinished]);

  const transport = useMemo(() => createAssistantChatTransport(ASSISTANT_PAGE_CHAT_API, contextStore), [contextStore]);

  const { messages, setMessages, sendMessage, status, addToolApprovalResponse } = useChat({
    id: threadId,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message, messages: all }) => onTurnFinishedRef.current?.({ threadId, message, messages: all }),
    transport,
    // Read once, when the chat is created; the page keys the conversation by thread.
    messages: thread.messages,
    onError: (err) => {
      console.error("Assistant chat error:", err);
      setError(ASSISTANT_ERROR_TEXT);
    },
  });

  const busy = status === "submitted" || status === "streaming";
  const pendingApprovalIds = useMemo(() => pendingApprovalIdsOf(messages), [messages]);

  const send = useCallback(
    ({ text, files }: AssistantSendInput): boolean => {
      const trimmed = text?.trim() ?? "";
      const attached = files && files.length > 0 ? files : undefined;
      if ((!trimmed && !attached) || busy) return false;
      setError(null);
      // The server denies the same approvals when the message arrives; this keeps the card in step.
      if (pendingApprovalIdsOf(messages).length > 0) {
        setMessages((prev) => denyPendingInLast(prev, NEW_MESSAGE_DENIAL_REASON));
      }
      if (trimmed) void sendMessage({ text: trimmed, files: attached });
      else if (attached) void sendMessage({ files: attached });
      return true;
    },
    [busy, messages, sendMessage, setMessages],
  );

  const approve = useCallback(
    (approvalIds: readonly string[], approved: boolean, reason?: string) => {
      for (const id of approvalIds) void addToolApprovalResponse({ id, approved, reason });
    },
    [addToolApprovalResponse],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    messages: messages as AssistantUIMessage[],
    status,
    busy,
    error,
    clearError,
    send,
    approve,
    pendingApprovalIds,
  };
}
