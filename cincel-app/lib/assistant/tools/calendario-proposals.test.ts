// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const apply = vi.hoisted(() => ({ applyProposal: vi.fn(), undoProposal: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/calendario/apply", () => apply);

import { apply_proposal, undo_proposal } from "@/lib/assistant/tools/calendario";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const ctx = { user: { member: { id: "s1" } } as unknown as AuthenticatedUser, context: { route: "/calendario" }, threadId: "t1" };
const id = "123e4567-e89b-42d3-a456-426614174000";

describe("apply_proposal and undo_proposal", () => {
  beforeEach(() => {
    apply.applyProposal.mockReset();
    apply.undoProposal.mockReset();
  });

  it("are write tools that ask for confirmation", () => {
    for (const tool of [apply_proposal, undo_proposal]) {
      expect(tool.definition.confirm).toBe(true);
      expect(tool.definition.write).toBe(true);
    }
  });

  it("validate their input", () => {
    expect(apply_proposal.definition.schema.safeParse({ proposalId: "no" }).success).toBe(false);
    expect(apply_proposal.definition.schema.safeParse({ proposalId: id, changeIds: ["a"] }).success).toBe(true);
    expect(undo_proposal.definition.schema.safeParse({}).success).toBe(false);
  });

  it("apply passes the subset and returns the result", async () => {
    apply.applyProposal.mockResolvedValue({ proposalId: id, applied: ["a"], skipped: [], undoToken: "tok", undoExpiresAt: null, toast: "ok" });
    const out = await apply_proposal.definition.run(ctx, { proposalId: id, changeIds: ["a"] });
    expect(apply.applyProposal).toHaveBeenCalledWith(ctx.user, id, ["a"]);
    expect(out).toMatchObject({ applied: ["a"] });
  });

  it("turns refusals into a failure with the calendar copy", async () => {
    apply.applyProposal.mockRejectedValue(new Error("EXPIRED"));
    expect(await apply_proposal.definition.run(ctx, { proposalId: id })).toEqual({
      ok: false,
      error: "EXPIRED",
      message: "La propuesta expiró. Pide una nueva.",
    });
    apply.undoProposal.mockRejectedValue(new Error("UNDO_EXPIRED"));
    expect(await undo_proposal.definition.run(ctx, { undoToken: "a".repeat(64) })).toMatchObject({ ok: false, error: "UNDO_EXPIRED" });
  });
});
