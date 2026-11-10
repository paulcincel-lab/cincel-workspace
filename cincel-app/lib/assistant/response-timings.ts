/**
 * Message metadata of a chat response (`AssistantMessageMeta`): tool
 * durations, response time and token usage, streamed to the client and
 * stored in `assistant_messages.metadata` with the message.
 */
import type { TextStreamPart, ToolSet, UIMessage } from "ai";

import type { AssistantMessageMeta } from "@/lib/types/asistente";

/**
 * The timings of one response: `onToolExecutionEnd` records each tool's
 * duration by call id, and `messageMetadata` streams `{ createdAt }` on
 * `start` and `{ toolMs, responseMs, usage }` on `finish`. When the response
 * continues a stored message (the approval resume), `createdAt` stays the
 * stored one and `toolMs` keeps the earlier durations.
 */
export function responseTimings(continued?: AssistantMessageMeta) {
  const toolMs = new Map<string, number>();
  let startedAt = Date.now();
  return {
    onToolExecutionEnd(event: { toolCall: { toolCallId: string }; toolExecutionMs: number }): void {
      toolMs.set(event.toolCall.toolCallId, event.toolExecutionMs);
    },
    messageMetadata({ part }: { part: TextStreamPart<ToolSet> }): AssistantMessageMeta | undefined {
      if (part.type === "start") {
        startedAt = Date.now();
        return continued ? undefined : { createdAt: new Date(startedAt).toISOString() };
      }
      if (part.type === "finish") {
        return {
          toolMs: { ...continued?.toolMs, ...Object.fromEntries(toolMs) },
          responseMs: Date.now() - startedAt,
          usage: { inputTokens: part.totalUsage.inputTokens ?? 0, outputTokens: part.totalUsage.outputTokens ?? 0 },
        };
      }
      return undefined;
    },
  };
}

/** The metadata of the last message when it is the assistant's (the response continues it). */
export function continuedMeta(messages: readonly UIMessage[]): AssistantMessageMeta | undefined {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return undefined;
  return (last.metadata as AssistantMessageMeta | undefined) ?? {};
}
