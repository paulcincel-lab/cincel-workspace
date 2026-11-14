/**
 * Cron job `support-github-sync` (Soporte, #1117). Every 30 minutes (window
 * `support-github-sync:<slot>`), moves published solicitudes along with their
 * GitHub issue. Never runs while `SOPORTE_GITHUB_ENABLED` is off. Batches of
 * 50, least recently synced first; stops (and resumes next run) when GitHub
 * rate-limits or is unavailable, logging once and changing nothing further.
 */
import { registerJob, type CronJob, type CronJobContext } from "@/lib/cron/registry";
import { getGithubIssue, GithubApiError, isGithubConfigured } from "@/lib/github/client";
import { applySyncedStatus, listSyncableTickets } from "@/lib/repositories/support-repository";
import { mapIssueToChange } from "@/lib/soporte/github-sync-map";
import { SOPORTE_GITHUB_ENABLED } from "@/lib/soporte/flags";

export const SUPPORT_GITHUB_SYNC_EVERY_MS = 30 * 60_000;
export const SUPPORT_GITHUB_SYNC_BATCH = 50;

/** One run per 30-minute slot, only with the GitHub flag on. */
export function supportGithubSyncDue(now: Date): { run: boolean; windowKey: string } {
  const slot = Math.floor(now.getTime() / SUPPORT_GITHUB_SYNC_EVERY_MS);
  return { run: SOPORTE_GITHUB_ENABLED, windowKey: `support-github-sync:${slot}` };
}

export type SupportGithubSyncDeps = {
  getIssue?: typeof getGithubIssue;
  list?: typeof listSyncableTickets;
  apply?: typeof applySyncedStatus;
  configured?: () => boolean;
  clock?: () => number;
};

function logStopped(traceId: string, reason: string, error?: unknown): void {
  console.error(
    JSON.stringify({
      event: "support.github_sync_stopped",
      traceId,
      reason,
      error: error instanceof Error ? error.message : undefined,
    })
  );
}

/** The job body, with injectable GitHub client, repository and clock for tests. */
export async function runSupportGithubSync(
  ctx: Pick<CronJobContext, "traceId" | "budgetMs">,
  deps: SupportGithubSyncDeps = {}
): Promise<{ count: number }> {
  const getIssue = deps.getIssue ?? getGithubIssue;
  const list = deps.list ?? listSyncableTickets;
  const apply = deps.apply ?? applySyncedStatus;
  const clock = deps.clock ?? Date.now;
  if (!(deps.configured ?? isGithubConfigured)()) {
    logStopped(ctx.traceId, "not_configured");
    return { count: 0 };
  }

  const started = clock();
  const tickets = await list(SUPPORT_GITHUB_SYNC_BATCH);
  let count = 0;
  for (const ticket of tickets) {
    if (clock() - started >= ctx.budgetMs) break;
    try {
      const issue = await getIssue(ticket.githubIssueNumber);
      // A deleted issue changes nothing but is stamped so it does not hold the queue head.
      const change = issue ? mapIssueToChange(ticket.status, issue) : null;
      const result = await apply(ticket.id, change?.status ?? null, change?.message);
      if (result.ok && change) count++;
    } catch (error) {
      const limited = error instanceof GithubApiError && error.rateLimited;
      logStopped(ctx.traceId, limited ? "rate_limited" : "github_unavailable", error);
      break;
    }
  }
  return { count };
}

export const supportGithubSyncJob: CronJob = {
  name: "support-github-sync",
  due: (now) => supportGithubSyncDue(now),
  run: (ctx) => runSupportGithubSync(ctx),
};

registerJob(supportGithubSyncJob);
