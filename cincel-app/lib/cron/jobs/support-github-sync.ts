/**
 * Cron job `support-github-sync` (Soporte, #1117). Every 30 minutes (window
 * `support-github-sync:<slot>`), moves published solicitudes along with their
 * GitHub issue. Stub: it never runs while `SOPORTE_GITHUB_ENABLED` is off and
 * does nothing until #1117 implements `run`.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";
import { SOPORTE_GITHUB_ENABLED } from "@/lib/soporte/flags";

export const SUPPORT_GITHUB_SYNC_EVERY_MS = 30 * 60_000;

/** One run per 30-minute slot, only with the GitHub flag on. */
export function supportGithubSyncDue(now: Date): { run: boolean; windowKey: string } {
  const slot = Math.floor(now.getTime() / SUPPORT_GITHUB_SYNC_EVERY_MS);
  return { run: SOPORTE_GITHUB_ENABLED, windowKey: `support-github-sync:${slot}` };
}

export const supportGithubSyncJob: CronJob = {
  name: "support-github-sync",
  due: (now) => supportGithubSyncDue(now),
  run: async () => ({ count: 0 }),
};

registerJob(supportGithubSyncJob);
