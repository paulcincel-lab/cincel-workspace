/**
 * Cron job `auto-close-jornadas` (redesign BE §13, owned by Phase 6). Every
 * tick: (1) auto-closes forgotten time entries (BE §8.7); (2) from
 * `dayStart + 2 h` on a required work day, sends the missing clock-in
 * notification once per day (its own `cron_runs` window `sin_entrada:<date>`,
 * BE §9.5). The job itself has no window, so `due()` always runs it.
 */
import { registerJob, type CronJob } from "@/lib/cron/registry";
import { autoCloseOpenEntries, notifyMissingClockIns } from "@/lib/time-tracking/auto-close";
import { getTimeTrackingSettings } from "@/lib/time-tracking/settings";

export const autoCloseJornadasJob: CronJob = {
  name: "auto-close-jornadas",
  due: () => ({ run: true }),
  run: async ({ db, now }) => {
    const settings = await getTimeTrackingSettings();
    const closed = await autoCloseOpenEntries(db, settings, now);
    const reminded = await notifyMissingClockIns(db, settings, now);
    return { count: closed + reminded };
  },
};

registerJob(autoCloseJornadasJob);
