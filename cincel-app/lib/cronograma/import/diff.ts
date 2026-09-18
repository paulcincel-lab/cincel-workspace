import type { ImportDiffSummary, NormalizedScheduleTask } from "@/lib/types/schedule";

/** Pure diff between the schedule's current tasks and a freshly parsed import — kept/new/removed by stableKey. */
export function computeImportDiff(
  existingTasks: Array<{ stableKey: string; tarea: string }>,
  incoming: NormalizedScheduleTask[]
): ImportDiffSummary {
  const existingByKey = new Map(existingTasks.map((t) => [t.stableKey, t]));
  const incomingKeys = new Set(incoming.map((t) => t.stableKey));

  let keptCount = 0;
  let newCount = 0;
  for (const t of incoming) {
    if (existingByKey.has(t.stableKey)) keptCount += 1;
    else newCount += 1;
  }

  const removedTasks = existingTasks
    .filter((t) => !incomingKeys.has(t.stableKey))
    .map((t) => ({ stableKey: t.stableKey, tarea: t.tarea }));

  return { keptCount, newCount, removedCount: removedTasks.length, removedTasks };
}
