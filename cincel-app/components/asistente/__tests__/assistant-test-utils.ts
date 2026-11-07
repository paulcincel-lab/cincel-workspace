/** Helpers for the assistant sheet tests: a UI message stream response like the chat route returns. */
export function uiMessageStream(chunks: object[]): Response {
  const encoder = new TextEncoder();
  const text = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
  });
}

export function textReply(id: string, text: string): object[] {
  return [
    { type: "start", messageId: id },
    { type: "start-step" },
    { type: "text-start", id: `${id}-t` },
    { type: "text-delta", id: `${id}-t`, delta: text },
    { type: "text-end", id: `${id}-t` },
    { type: "finish-step" },
    { type: "finish" },
  ];
}

export function approvalRequest(id: string, toolName: string, input: unknown): object[] {
  return [
    { type: "start", messageId: id },
    { type: "start-step" },
    { type: "tool-input-available", toolCallId: "call-1", toolName, input },
    { type: "tool-approval-request", approvalId: "ap-1", toolCallId: "call-1" },
    { type: "finish-step" },
    { type: "finish" },
  ];
}

export function toolResult(output: unknown, closing: string): object[] {
  return [
    { type: "start" },
    { type: "start-step" },
    { type: "tool-output-available", toolCallId: "call-1", output },
    { type: "finish-step" },
    { type: "start-step" },
    { type: "text-start", id: "after" },
    { type: "text-delta", id: "after", delta: closing },
    { type: "text-end", id: "after" },
    { type: "finish-step" },
    { type: "finish" },
  ];
}

export function toolDenied(closing: string): object[] {
  return [
    { type: "start" },
    { type: "start-step" },
    { type: "tool-output-denied", toolCallId: "call-1" },
    { type: "finish-step" },
    { type: "start-step" },
    { type: "text-start", id: "after" },
    { type: "text-delta", id: "after", delta: closing },
    { type: "text-end", id: "after" },
    { type: "finish-step" },
    { type: "finish" },
  ];
}

export function toolError(errorText: string): object[] {
  return [
    { type: "start" },
    { type: "start-step" },
    { type: "tool-output-error", toolCallId: "call-1", errorText },
    { type: "finish-step" },
    { type: "finish" },
  ];
}
