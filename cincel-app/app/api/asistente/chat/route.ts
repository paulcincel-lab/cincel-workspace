import { type NextRequest, NextResponse } from "next/server";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";

import { getSession, requireCapabilityUser } from "@/lib/auth/session";
import { getLanguageModel, isAssistantConfigured } from "@/lib/assistant/provider";
import { buildAssistantTools } from "@/lib/assistant/tools";
import { buildSystemPrompt } from "@/lib/assistant/prompt";

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

  let user;
  try {
    user = await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { messages }: { messages: UIMessage[] } = await request.json();

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
