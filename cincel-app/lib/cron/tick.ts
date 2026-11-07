/**
 * One cron tick (redesign BE §8.0.4, §13): takes the `tick` lease for 55 s,
 * runs the registered jobs sequentially within a 50 s budget (per-job
 * try/catch + `cron.job_failed` JSON log, `cron_runs` bookkeeping for
 * windowed jobs).
 */
import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { acquireLease, releaseLease, TICK_LEASE_SECONDS } from "@/lib/cron/lease";
import { registeredJobs, type CronJob } from "@/lib/cron/registry";
import { cronRuns } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { GENERAL_SETTINGS_DEFAULTS } from "@/lib/settings/general-settings";

/** Total budget of one tick. */
export const TICK_BUDGET_MS = 50_000;

/** Lease row of the whole tick. */
export const TICK_LEASE_JOB = "tick";

export type TickReport = {
  /** false when another tick holds the lease (route answers 204). */
  acquired: boolean;
  ran: { job: string; ms: number; count: number }[];
  skipped: { job: string; reason: string }[];
};

/** Why a job did not run in this tick. */
export type TickSkipReason = "not_due" | "window_done" | "budget" | "failed";

export type RunTickOptions = {
  /** Database handle; defaults to the app client. */
  db?: OwnerDb;
  /** Jobs to run; defaults to the registry. */
  jobs?: CronJob[];
  /** Time zone handed to `due()`; defaults to the org's regional time zone. */
  tz?: string;
  /** Total budget; defaults to {@link TICK_BUDGET_MS}. */
  budgetMs?: number;
  /** Lease length in seconds; defaults to {@link TICK_LEASE_SECONDS}. */
  leaseSeconds?: number;
  /** Lease row; defaults to {@link TICK_LEASE_JOB}. */
  leaseJob?: string;
  /** Monotonic clock for the budget (tests). */
  clock?: () => number;
};

async function defaultDb(): Promise<OwnerDb> {
  const { db } = await import("@/lib/db/client");
  return db;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function logJobFailed(job: string, traceId: string, err: unknown): void {
  console.error(
    JSON.stringify({
      level: "error",
      msg: "cron.job_failed",
      job,
      trace_id: traceId,
      error: errorText(err),
    })
  );
}

/** Claims `(job, windowKey)`; false when that window already ran (or is running). */
async function claimWindow(db: OwnerDb, job: string, windowKey: string): Promise<boolean> {
  const rows = await db
    .insert(cronRuns)
    .values({ job, windowKey, status: "running" })
    .onConflictDoNothing()
    .returning({ job: cronRuns.job });
  return rows.length > 0;
}

async function finishWindow(
  db: OwnerDb,
  job: string,
  windowKey: string,
  status: "done" | "failed",
  detail: Record<string, unknown>
): Promise<void> {
  await db
    .update(cronRuns)
    .set({ status, detail, finishedAt: sql`now()` })
    .where(and(eq(cronRuns.job, job), eq(cronRuns.windowKey, windowKey)));
}

/**
 * Runs one tick. Returns `acquired: false` without running anything when
 * another tick holds the lease. A job that throws is logged, its window row
 * is marked `failed`, and the tick continues with the next job.
 */
export async function runTick(now: Date, options: RunTickOptions = {}): Promise<TickReport> {
  const db = options.db ?? (await defaultDb());
  const jobs = options.jobs ?? registeredJobs();
  const tz = options.tz ?? GENERAL_SETTINGS_DEFAULTS.regional.timeZone;
  const budgetMs = options.budgetMs ?? TICK_BUDGET_MS;
  const leaseJob = options.leaseJob ?? TICK_LEASE_JOB;
  const clock = options.clock ?? (() => performance.now());
  const owner = randomUUID();

  const acquired = await acquireLease(db, leaseJob, owner, options.leaseSeconds ?? TICK_LEASE_SECONDS);
  const report: TickReport = { acquired, ran: [], skipped: [] };
  if (!acquired) return report;

  const started = clock();
  try {
    for (const job of jobs) {
      const remaining = budgetMs - (clock() - started);
      if (remaining <= 0) {
        report.skipped.push({ job: job.name, reason: "budget" satisfies TickSkipReason });
        continue;
      }

      const traceId = randomUUID();
      let windowKey: string | undefined;
      try {
        const due = job.due(now, tz);
        if (!due.run) {
          report.skipped.push({ job: job.name, reason: "not_due" satisfies TickSkipReason });
          continue;
        }
        windowKey = due.windowKey;
        if (windowKey && !(await claimWindow(db, job.name, windowKey))) {
          report.skipped.push({ job: job.name, reason: "window_done" satisfies TickSkipReason });
          continue;
        }

        const jobStarted = clock();
        const result = await job.run({ db, now, traceId, budgetMs: remaining });
        const ms = Math.round(clock() - jobStarted);
        report.ran.push({ job: job.name, ms, count: result.count });
        if (windowKey) await finishWindow(db, job.name, windowKey, "done", { count: result.count, ms, trace_id: traceId });
      } catch (err) {
        logJobFailed(job.name, traceId, err);
        report.skipped.push({ job: job.name, reason: "failed" satisfies TickSkipReason });
        if (windowKey) {
          try {
            await finishWindow(db, job.name, windowKey, "failed", { error: errorText(err), trace_id: traceId });
          } catch (bookkeepingErr) {
            logJobFailed(job.name, traceId, bookkeepingErr);
          }
        }
      }
    }
  } finally {
    await releaseLease(db, leaseJob, owner);
  }
  return report;
}
