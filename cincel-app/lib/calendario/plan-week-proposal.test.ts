// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const notify = vi.hoisted(() => vi.fn(async () => ({ created: 1 })));
vi.mock("@/lib/notifications/notify", () => ({ notify }));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/calendario/plan-week-data", () => ({ computePlanWeek: vi.fn(), canPlanOthers: vi.fn() }));
vi.mock("@/lib/repositories/proposals-repository", () => ({ createProposal: vi.fn() }));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { notifyPlanWeekOwners, planWeekLine, planWeekTitle, shortDate } from "@/lib/calendario/plan-week-proposal";
import type { ProposalChange } from "@/lib/types/calendario";

const viewer = { member: { id: "ana", name: "Ana García" } } as unknown as AuthenticatedUser;

const change = (changeId: string, staffId: string | null, date: string): ProposalChange => ({
  changeId,
  type: "task_date",
  taskId: `t-${changeId}`,
  title: changeId,
  projectName: null,
  before: { date: null, field: "commitmentDate" },
  after: { date },
  staffId,
});

describe("plan week copy", () => {
  it("formats the title and the line", () => {
    expect(shortDate("2026-11-16")).toBe("16 nov");
    expect(planWeekTitle("2026-11-16")).toBe("Planear la semana del 16 nov");
    expect(planWeekLine(3, 0)).toBe("3 tareas acomodadas");
    expect(planWeekLine(1, 2)).toBe("1 tarea acomodada · 2 no cupieron");
  });
});

describe("notifyPlanWeekOwners", () => {
  beforeEach(() => notify.mockClear());

  it("notifies each other owner once, never the viewer", async () => {
    const proposal = {
      id: "p1",
      kind: "planear_semana" as const,
      changes: [change("c1", "ana", "2026-11-16"), change("c2", "jorge", "2026-11-17"), change("c3", "jorge", "2026-11-18"), change("c4", "jorge", "2026-11-19"), change("c5", "luis", "2026-11-17")],
    };
    const out = await notifyPlanWeekOwners(viewer, proposal);
    expect(out.notified).toBe(2);
    expect(notify).toHaveBeenCalledTimes(2);
    const [, ids, payload] = notify.mock.calls[0] as unknown as [unknown, string[], Record<string, string>];
    expect(ids).toEqual(["jorge"]);
    expect(payload).toMatchObject({
      kind: "asignacion",
      title: "Tu semana cambió",
      body: "Ana García planeó 3 tareas tuyas para la semana del 16 nov.",
      actorId: "ana",
    });
  });

  it("counts only the applied changes", async () => {
    const proposal = { id: "p1", kind: "planear_semana" as const, changes: [change("c1", "jorge", "2026-11-17"), change("c2", "jorge", "2026-11-18")] };
    await notifyPlanWeekOwners(viewer, proposal, ["c2"]);
    const payload = (notify.mock.calls[0] as unknown as [unknown, unknown, Record<string, string>])[2];
    expect(payload.body).toBe("Ana García planeó 1 tarea tuya para la semana del 16 nov.");
  });

  it("does nothing for other proposal kinds", async () => {
    const out = await notifyPlanWeekOwners(viewer, { id: "p", kind: "mover_tareas", changes: [change("c1", "jorge", "2026-11-17")] });
    expect(out.notified).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });
});
