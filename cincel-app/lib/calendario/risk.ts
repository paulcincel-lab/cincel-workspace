/** Risk and blocking lists for the summaries (BE §10.1). Pure and client-safe. Bodies belong to the Phase 4 issue. */
import { notImplemented } from "@/lib/stubs";
import type { CalEventItem, CalTaskItem, SummaryItem } from "@/lib/types/calendario";

export type RiskInput = {
  viewerId: string;
  today: string;
  from: string;
  to: string;
  tasks: (CalTaskItem & { blockedSince: string | null; dependents: { taskId: string; title: string; date: string | null }[] })[];
  meetings: CalEventItem[];
};

/** Blocked tasks with open successors, and overdue tasks a nearby meeting depends on. */
export function riskItems(input: RiskInput): SummaryItem[] {
  return notImplemented("riskItems", input);
}

/** Open tasks of the viewer that another person's open task waits for. */
export function blockingItems(input: RiskInput): SummaryItem[] {
  return notImplemented("blockingItems", input);
}
