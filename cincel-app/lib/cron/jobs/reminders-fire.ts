/**
 * Cron job `reminders-fire` (redesign BE §13, owned by Phase 5).
 * Fires due reminders (BE §8.5). Every tick.
 *
 * Contract stub: never due, runs nothing.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";

export const remindersFireJob: CronJob = {
  name: "reminders-fire",
  due: () => ({ run: false }),
  run: async () => ({ count: 0 }),
};

registerJob(remindersFireJob);
