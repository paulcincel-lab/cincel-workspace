/**
 * Daily producers (redesign BE §13, FE §21.1): run once a day, only by the
 * `daily-digest` job and before the digests are sent, to create the day's
 * notifications. One file per producer, listed here.
 */
import type { CronJobContext } from "@/lib/cron/registry";

import { vencimientoProducer } from "./vencimiento";

export type DailyProducer = {
  name: string;
  /** Creates the day's notifications; returns how many rows it created. */
  run(ctx: CronJobContext): Promise<{ count: number }>;
};

export const DAILY_PRODUCERS: readonly DailyProducer[] = [vencimientoProducer];

export type DailyProducersReport = {
  /** Rows created by all producers. */
  count: number;
  /** Producers that threw (logged as `cron.producer_failed`). */
  failed: string[];
};

/**
 * Runs every producer in order. A producer that throws is logged and skipped,
 * so one broken producer never stops the others or the digest.
 */
export async function runDailyProducers(
  ctx: CronJobContext,
  producers: readonly DailyProducer[] = DAILY_PRODUCERS
): Promise<DailyProducersReport> {
  const report: DailyProducersReport = { count: 0, failed: [] };
  for (const producer of producers) {
    try {
      const result = await producer.run(ctx);
      report.count += result.count;
    } catch (err) {
      report.failed.push(producer.name);
      console.error(
        JSON.stringify({
          level: "error",
          msg: "cron.producer_failed",
          producer: producer.name,
          trace_id: ctx.traceId,
          error: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }
  return report;
}
