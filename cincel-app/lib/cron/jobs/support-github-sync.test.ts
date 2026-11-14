import { describe, expect, it, vi } from "vitest";

import { GithubApiError } from "@/lib/github/client";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/repositories/support-repository", () => ({ listSyncableTickets: vi.fn(), applySyncedStatus: vi.fn() }));

const ctx = { traceId: "t", budgetMs: 1_000_000 };
const open = { number: 1, state: "open", stateReason: null, labels: [], hasOpenPullRequest: false } as const;

async function setup() {
  return import("./support-github-sync");
}

describe("supportGithubSyncDue", () => {
  it("is off while the GitHub flag is off and keys the 30-minute slot", async () => {
    const { supportGithubSyncDue } = await setup();
    const due = supportGithubSyncDue(new Date("2026-11-01T10:10:00Z"));
    expect(due.run).toBe(false);
    expect(due.windowKey).toBe(supportGithubSyncDue(new Date("2026-11-01T10:20:00Z")).windowKey);
    expect(due.windowKey).not.toBe(supportGithubSyncDue(new Date("2026-11-01T10:31:00Z")).windowKey);
  });
});

describe("runSupportGithubSync", () => {
  it("applies mapped changes and stamps unchanged tickets", async () => {
    const { runSupportGithubSync } = await setup();
    const apply = vi.fn().mockResolvedValue({ ok: true, data: null });
    const getIssue = vi
      .fn()
      .mockResolvedValueOnce({ ...open, labels: ["en progreso"] })
      .mockResolvedValueOnce(open);
    const out = await runSupportGithubSync(ctx, {
      configured: () => true,
      list: async () => [
        { id: "a", githubIssueNumber: 1, status: "planeado" },
        { id: "b", githubIssueNumber: 2, status: "planeado" },
      ],
      getIssue,
      apply,
    });
    expect(out.count).toBe(1);
    expect(apply).toHaveBeenNthCalledWith(1, "a", "en_progreso", undefined);
    expect(apply).toHaveBeenNthCalledWith(2, "b", null, undefined);
  });

  it("changes nothing and logs once when GitHub is unavailable", async () => {
    const { runSupportGithubSync } = await setup();
    const apply = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await runSupportGithubSync(ctx, {
      configured: () => true,
      list: async () => [
        { id: "a", githubIssueNumber: 1, status: "planeado" },
        { id: "b", githubIssueNumber: 2, status: "planeado" },
      ],
      getIssue: vi.fn().mockRejectedValue(new Error("network")),
      apply,
    });
    expect(out.count).toBe(0);
    expect(apply).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("stops on a rate limit and keeps what was applied", async () => {
    const { runSupportGithubSync } = await setup();
    const apply = vi.fn().mockResolvedValue({ ok: true, data: null });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const getIssue = vi
      .fn()
      .mockResolvedValueOnce({ ...open, state: "closed", stateReason: "completed" })
      .mockRejectedValueOnce(new GithubApiError(429, "slow down"));
    const out = await runSupportGithubSync(ctx, {
      configured: () => true,
      list: async () => [
        { id: "a", githubIssueNumber: 1, status: "planeado" },
        { id: "b", githubIssueNumber: 2, status: "planeado" },
        { id: "c", githubIssueNumber: 3, status: "planeado" },
      ],
      getIssue,
      apply,
    });
    expect(out.count).toBe(1);
    expect(getIssue).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("does nothing when GitHub is not configured", async () => {
    const { runSupportGithubSync } = await setup();
    const list = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await runSupportGithubSync(ctx, { configured: () => false, list })).toEqual({ count: 0 });
    expect(list).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
