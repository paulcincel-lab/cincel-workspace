/** Redistribution of an overloaded day (BE §10.3). Pure and client-safe. Body belongs to the Phase 5 issue. */
import { notImplemented } from "@/lib/stubs";
import type { DayLoad, DeferredItem } from "@/lib/types/calendario";
import type { TaskPriority } from "@/lib/types/core";

export function proposeRedistribution(input: {
  staffId: string;
  date: string;
  target: "spread" | "next_day";
  /** Default 5 workdays. */
  horizonDays: number;
  load: DayLoad[];
  tasks: {
    taskId: string;
    hours: number;
    priority: TaskPriority;
    blocked: boolean;
    fixed: boolean;
    dependsOn: string[];
    dependents: { taskId: string; date: string }[];
  }[];
  workDays: number[];
  absences: string[];
  today: string;
}): { moves: { taskId: string; from: string; to: string; reason: string }[]; deferred: DeferredItem[] } {
  return notImplemented("proposeRedistribution", input);
}
