import { DefaultChatTransport, type UIMessage } from "ai";

import { buildAssistantChatRequestBody } from "@/lib/assistant/chat-request";
import type { AssistantContext } from "@/lib/types/redesign";

/**
 * Holds the latest page context for the chat transport. The component updates
 * it from an effect; the transport reads it only when a request is sent.
 */
export class AssistantContextStore {
  private current: AssistantContext;

  constructor(initial: AssistantContext) {
    this.current = initial;
  }

  set(next: AssistantContext): void {
    this.current = next;
  }

  get(): AssistantContext {
    return this.current;
  }
}

/**
 * Server-thread transport for `POST /api/asistente/chat` (redesign FE §3.9):
 * each request carries only the new message or the approval responses, plus
 * the page context at send time.
 */
export function createAssistantChatTransport(
  api: string,
  contextStore: AssistantContextStore,
): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api,
    prepareSendMessagesRequest: ({ id, messages }) => ({
      body: buildAssistantChatRequestBody({ id, messages, context: contextStore.get() }),
    }),
  });
}
