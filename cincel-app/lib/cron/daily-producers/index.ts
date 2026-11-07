/**
 * Daily producers (redesign BE §13, FE §21.1): run once a day, only by the
 * `daily-digest` job, to create the day's notifications. One file per
 * producer, listed here.
 */
import type { CronJobContext } from "@/lib/cron/registry";

import { vencimientoProducer } from "./vencimiento";

export type DailyProducer = {
  name: string;
  /** Creates the day's notifications; returns how many rows it created. */
  run(ctx: CronJobContext): Promise<{ count: number }>;
};

export const DAILY_PRODUCERS: readonly DailyProducer[] = [vencimientoProducer];
