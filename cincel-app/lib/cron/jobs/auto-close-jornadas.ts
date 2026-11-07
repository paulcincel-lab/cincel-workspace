/**
 * Cron job `auto-close-jornadas` (redesign BE §13, owned by Phase 6).
 * Auto-closes forgotten time entries (BE §8.7) and, at `dayStart + 2 h`, sends the missing clock-in notification (window `sin_entrada:<date>`). Every tick.
 *
 * Contract stub: never due, runs nothing.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";

export const autoCloseJornadasJob: CronJob = {
  name: "auto-close-jornadas",
  due: () => ({ run: false }),
  run: async () => ({ count: 0 }),
};

registerJob(autoCloseJornadasJob);
