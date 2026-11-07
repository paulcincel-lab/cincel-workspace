/**
 * `vencimiento` daily producer (redesign BE §8.3, §13; Phase 3 implements it):
 * tasks due tomorrow and overdue, dedupe per task per day, admin tasks to
 * administrators only.
 *
 * Contract stub: produces nothing.
 */
import type { DailyProducer } from "./index";

export const vencimientoProducer: DailyProducer = {
  name: "vencimiento",
  run: async () => ({ count: 0 }),
};
