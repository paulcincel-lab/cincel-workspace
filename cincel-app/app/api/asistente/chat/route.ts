import { type NextRequest, NextResponse } from "next/server";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import { getSession } from "@/lib/auth/session";
import { getLanguageModel, isAssistantConfigured } from "@/lib/assistant/provider";
import { ASSISTANT_TOOLS } from "@/lib/assistant/tools";
import { SYSTEM_PROMPT } from "@/lib/assistant/prompt";

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

  const { messages }: { messages: UIMessage[] } = await request.json();

  const result = streamText({
    model: getLanguageModel(),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: ASSISTANT_TOOLS,
    // Ceiling on tool-call round-trips per user turn — a cost/availability
    // guard, not data safety (every tool is read-only).
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
