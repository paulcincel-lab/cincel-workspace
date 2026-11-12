/**
 * `propose_from_text` (Calendario BE §11.2, §14): the Barra para pedir turns
 * a sentence into a proposal. One `generateText` call with the tools
 * `[create_event, move_tasks]`, `toolChoice: "required"` and one step; both
 * tools only write a proposal row. Server-only.
 */
import "server-only";

import { generateText, stepCountIs, type ToolSet } from "ai";

import type { ToolFailure, ToolRunContext } from "@/lib/assistant/define-tool";
import { getLanguageModel } from "@/lib/assistant/provider";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { buildProposePrompt, parseOverdueMove, todayIn } from "@/lib/calendario/propose-context";
import { failure, loadOverdueTaskIds, loadPromptTasks, proposeMoveTasks } from "@/lib/calendario/propose";
import { getProposal } from "@/lib/repositories/proposals-repository";
import { TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import type { Proposal } from "@/lib/types/calendario";

/** Model calls: 20 per 10 minutes per person (BE §14). */
export const proposeRateLimiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

/** Tools the Barra's model may call; the chat model already has both. */
export const PROPOSING_TOOL_NAMES = ["create_event", "move_tasks"] as const;

export type ProposeFromTextInput = {
  text: string;
  view: "dia" | "semana" | "mes";
  from: string;
  to: string;
  selectedDate?: string;
};

type ToolOutput = { ok?: unknown; proposalId?: unknown; error?: unknown; message?: unknown };

/** The proposal the text maps to, or a failure (`NO_INTENT` when the model called no tool). */
export async function proposeFromText(
  ctx: ToolRunContext,
  input: ProposeFromTextInput,
  now: Date = new Date(),
): Promise<{ ok: true; proposal: Proposal } | ToolFailure> {
  const limit = proposeRateLimiter.hit(ctx.user.member.id);
  if (!limit.allowed) return failure("RATE_LIMITED");

  // "Pasa lo vencido al jueves": no model needed, and the model could not see tasks that are not the caller's.
  const overdueTo = parseOverdueMove(input.text, todayIn(now, TIME_TRACKING_TIME_ZONE));
  if (overdueTo) {
    const taskIds = await loadOverdueTaskIds(ctx.user, todayIn(now, TIME_TRACKING_TIME_ZONE), input);
    if (taskIds.length === 0) return failure("NOT_FOUND", "No encontré tareas vencidas para pasar.");
    return proposeMoveTasks({ user: ctx.user, threadId: ctx.threadId ?? null }, { taskIds, toDate: overdueTo });
  }

  // Loaded here: the registry imports the tools that import this module.
  const { findDefinedTool } = await import("@/lib/assistant/tools/index");
  const toolSet: ToolSet = {};
  for (const name of PROPOSING_TOOL_NAMES) {
    const defined = findDefinedTool(name);
    if (defined && defined.definition.capability(ctx.user)) toolSet[name] = defined.toAiTool(ctx);
  }

  const today = todayIn(now, TIME_TRACKING_TIME_ZONE);
  const tasks = await loadPromptTasks(ctx.user, input.to);
  const result = await generateText({
    model: getLanguageModel(),
    system: buildProposePrompt({
      today,
      view: input.view,
      from: input.from,
      to: input.to,
      selectedDate: input.selectedDate,
      tasks,
    }),
    messages: [{ role: "user", content: input.text }],
    tools: toolSet,
    toolChoice: "required",
    stopWhen: stepCountIs(1),
  });

  const outputs = result.toolResults.map((r) => r.output as ToolOutput | undefined);
  const made = outputs.find((o) => o?.ok === true && typeof o.proposalId === "string");
  if (made) {
    const proposal = await getProposal(ctx.user, made.proposalId as string);
    if (proposal) return { ok: true, proposal };
  }
  const refused = outputs.find((o) => o?.ok === false && typeof o.error === "string");
  if (refused) {
    // Tools answer with a code and a message; an older shape carries the copy in `error`.
    return typeof refused.message === "string"
      ? failure(refused.error as string, refused.message)
      : failure("INVALID", refused.error as string);
  }
  return failure("NO_INTENT");
}
