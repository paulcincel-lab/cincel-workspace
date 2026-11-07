/**
 * Cron job `gmail-sync` (redesign BE §13, owned by Phase 5).
 * Syncs up to `GMAIL_SYNC_MAX_PER_TICK` connected staff, oldest first, skipping backoff. Every tick.
 *
 * Contract stub: never due, runs nothing.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";

export const gmailSyncJob: CronJob = {
  name: "gmail-sync",
  due: () => ({ run: false }),
  run: async () => ({ count: 0 }),
};

registerJob(gmailSyncJob);
