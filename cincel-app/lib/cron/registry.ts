/**
 * Cron job registry (redesign BE §8.0.4, §13). Each job is its own file in
 * `lib/cron/jobs/<name>.ts` calling `registerJob`; `lib/cron/jobs/index.ts`
 * imports every job file. No module schedules its own work.
 */
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

/** The canonical job names (redesign BE §21, Calendario BE §7). */
export const CRON_JOB_NAMES = [
  "notifications-deliver",
  "daily-digest",
  "reminders-fire",
  "gmail-sync",
  "auto-close-jornadas",
  "calendar-events-refresh",
  "calendar-meetings-resync",
] as const;
export type CronJobName = (typeof CRON_JOB_NAMES)[number];

export type CronJobContext = { db: OwnerDb; now: Date; traceId: string; budgetMs: number };

export type CronJob = {
  name: CronJobName;
  /** `windowKey` → the job runs once per window (`cron_runs`). */
  due(now: Date, tz: string): { run: boolean; windowKey?: string };
  run(ctx: CronJobContext): Promise<{ count: number }>;
};

const jobs = new Map<string, CronJob>();

/** Add a job to the registry (one call per job file, at import). */
export function registerJob(job: CronJob): void {
  jobs.set(job.name, job);
}

/** Registered jobs in registration order. */
export function registeredJobs(): CronJob[] {
  return [...jobs.values()];
}
