/**
 * One cron tick (redesign BE §8.0.4, §13): takes the `tick` lease for 55 s,
 * runs the registered jobs sequentially within a 50 s budget (per-job
 * try/catch + `cron.job_failed` JSON log, `cron_runs` bookkeeping for
 * windowed jobs).
 */
import { notImplemented } from "@/lib/stubs";

/** Total budget of one tick. */
export const TICK_BUDGET_MS = 50_000;

export type TickReport = {
  /** false when another tick holds the lease (route answers 204). */
  acquired: boolean;
  ran: { job: string; ms: number; count: number }[];
  skipped: { job: string; reason: string }[];
};

export async function runTick(now: Date): Promise<TickReport> {
  return notImplemented("runTick", now);
}
