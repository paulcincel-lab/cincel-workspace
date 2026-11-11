/** Weekly planner (BE §10.4). Pure and client-safe. Body belongs to the Phase 7 issue. */
import { notImplemented } from "@/lib/stubs";
import type { DeferredItem } from "@/lib/types/calendario";
import type { TaskPriority } from "@/lib/types/core";

export function planWeek(input: {
  weekStart: string;
  /** Mon–Fri workdays. */
  days: string[];
  people: {
    staffId: string;
    name: string;
    workday: number;
    absent: string[];
    /** Hours already planned per day. */
    booked: Record<string, number>;
  }[];
  backlog: {
    taskId: string;
    title: string;
    hours: number;
    priority: TaskPriority;
    managerId: string | null;
    deadline: string | null;
    dependsOn: string[];
    projectId: string | null;
  }[];
  now: string;
}): {
  placements: { taskId: string; staffId: string; date: string }[];
  deferred: DeferredItem[];
  cells: { staffId: string; date: string; before: number; after: number; workday: number }[];
} {
  return notImplemented("planWeek", input);
}
