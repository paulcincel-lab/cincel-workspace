/**
 * Cron job `daily-digest` (redesign BE §13, owned by Phase 1).
 * 07:30 local, window `daily-digest:<date>`: runs the daily producers, sends the digests, then housekeeping (notifications > 180 days, assistant threads beyond 50, Gmail threads beyond 500).
 *
 * Contract stub: never due, runs nothing.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";

export const dailyDigestJob: CronJob = {
  name: "daily-digest",
  due: () => ({ run: false }),
  run: async () => ({ count: 0 }),
};

registerJob(dailyDigestJob);
