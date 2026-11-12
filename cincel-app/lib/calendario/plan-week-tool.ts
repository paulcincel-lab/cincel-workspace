/** Body of the `plan_week` tool (BE §11.2). Server-only. */
import "server-only";

import type { ToolFailure } from "@/lib/assistant/define-tool";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canPlanOthers } from "@/lib/calendario/plan-week-data";
import { proposePlanWeek } from "@/lib/calendario/plan-week-proposal";
import type { DeferredItem, ProposalChange } from "@/lib/types/calendario";
import type { PlanWeekCell } from "@/lib/calendario/plan-week";

export type PlanWeekToolOutput = {
  proposalId: string;
  kind: "planear_semana";
  title: string;
  line: string;
  changes: ProposalChange[];
  deferred: DeferredItem[];
  cells: PlanWeekCell[];
};

export const PLAN_OTHERS_DENIED = "Para planear la semana de otras personas necesitas permiso para cambiar responsables.";

export async function runPlanWeekTool(
  ctx: { user: AuthenticatedUser; threadId?: string | null },
  input: { weekStart: string; staffIds?: string[]; taskIds?: string[] },
): Promise<PlanWeekToolOutput | ToolFailure> {
  const others = (input.staffIds ?? []).filter((id) => id !== ctx.user.member.id);
  if (others.length > 0 && !canPlanOthers(ctx.user)) return { ok: false, error: "FORBIDDEN", message: PLAN_OTHERS_DENIED };
  const { proposal, cells } = await proposePlanWeek(ctx.user, input, ctx.threadId ? { threadId: ctx.threadId } : undefined);
  return {
    proposalId: proposal.id,
    kind: "planear_semana",
    title: proposal.title,
    line: proposal.line,
    changes: proposal.changes,
    deferred: proposal.deferred,
    cells,
  };
}
