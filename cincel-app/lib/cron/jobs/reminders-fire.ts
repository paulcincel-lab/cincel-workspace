/**
 * Cron job `reminders-fire` (redesign BE §13, owned by Phase 5).
 * Fires due reminders (BE §8.5). Every tick, no window key: a reminder's own
 * `fired_at` / advanced `due_at` and the notification dedupe key keep a
 * repeated tick from firing it twice.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";
import { fireDueReminders } from "@/lib/my-space/reminders";

export const remindersFireJob: CronJob = {
  name: "reminders-fire",
  due: () => ({ run: true }),
  run: ({ db, now }) => fireDueReminders(db, now),
};

registerJob(remindersFireJob);
