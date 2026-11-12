// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const canPlanOthers = vi.hoisted(() => vi.fn());
const proposePlanWeek = vi.hoisted(() => vi.fn());
vi.mock("@/lib/calendario/plan-week-data", () => ({ canPlanOthers }));
vi.mock("@/lib/calendario/plan-week-proposal", () => ({ proposePlanWeek }));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { PLAN_OTHERS_DENIED, runPlanWeekTool } from "@/lib/calendario/plan-week-tool";

const user = { member: { id: "ana" } } as unknown as AuthenticatedUser;
const other = "11111111-1111-4111-8111-111111111111";

describe("plan_week tool", () => {
  beforeEach(() => {
    canPlanOthers.mockReset();
    proposePlanWeek.mockReset();
    proposePlanWeek.mockResolvedValue({
      proposal: { id: "p1", title: "Planear la semana del 16 nov", line: "1 tarea acomodada", changes: [], deferred: [] },
      cells: [],
    });
  });

  it("refuses to plan other people without permission", async () => {
    canPlanOthers.mockReturnValue(false);
    const out = await runPlanWeekTool({ user }, { weekStart: "2026-11-16", staffIds: [other] });
    expect(out).toEqual({ ok: false, error: "FORBIDDEN", message: PLAN_OTHERS_DENIED });
    expect(proposePlanWeek).not.toHaveBeenCalled();
  });

  it("plans the viewer's own lane without the permission", async () => {
    canPlanOthers.mockReturnValue(false);
    const out = await runPlanWeekTool({ user }, { weekStart: "2026-11-16", staffIds: ["ana"] });
    expect(out).toMatchObject({ proposalId: "p1", kind: "planear_semana" });
  });

  it("plans others with the permission and links the thread", async () => {
    canPlanOthers.mockReturnValue(true);
    await runPlanWeekTool({ user, threadId: "th1" }, { weekStart: "2026-11-16", staffIds: [other] });
    expect(proposePlanWeek).toHaveBeenCalledWith(user, { weekStart: "2026-11-16", staffIds: [other] }, { threadId: "th1" });
  });
});
