/**
 * Cron job `notifications-deliver` (redesign BE §13, owned by Phase 1).
 * Every tick, no window: sends the `email_status = 'pending'` notifications
 * whose `deliver_after ≤ now` (limit 200) and sets `sent` / `failed`.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";
import { deliverPendingEmails } from "@/lib/notifications/digest";

export const notificationsDeliverJob: CronJob = {
  name: "notifications-deliver",
  due: () => ({ run: true }),
  run: ({ db, now }) => deliverPendingEmails(db, now),
};

registerJob(notificationsDeliverJob);
