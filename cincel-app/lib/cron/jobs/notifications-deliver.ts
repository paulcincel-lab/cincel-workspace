/**
 * Cron job `notifications-deliver` (redesign BE §13, owned by Phase 1).
 * Sends `email_status = 'pending'` notifications whose `deliver_after ≤ now` (limit 200) and sets `sent` / `failed`. Every tick.
 *
 * Contract stub: never due, runs nothing.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";

export const notificationsDeliverJob: CronJob = {
  name: "notifications-deliver",
  due: () => ({ run: false }),
  run: async () => ({ count: 0 }),
};

registerJob(notificationsDeliverJob);
