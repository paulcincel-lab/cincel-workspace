"use client";

import { useMemo, useState, type ReactNode } from "react";

import { CalendarioOverlayContext, type CalendarioOverlay } from "@/components/widgets/calendario/overlay-context";
import { runProposingToolAction } from "@/lib/actions/calendario-actions";
import { buildDayAlerts, type DayAlert } from "@/lib/calendario/alerts";
import { overlaps } from "@/lib/calendario/load";
import { overlayEntries, originalItemIds } from "@/lib/calendario/proposal-view";
import { useActionMutation } from "@/lib/query/mutation";
import type { CalendarioRange, Proposal } from "@/lib/types/calendario";

import { useProposal } from "./use-proposal";

/** Hours each day gets when the checked changes of `proposal` are applied (tasks only; null when none move). */
export function afterHoursOf(proposal: Proposal | null, checked: readonly string[], range: CalendarioRange): Map<string, number> | null {
  if (!proposal) return null;
  const hoursOf = new Map(range.items.flatMap((i) => (i.kind === "task" ? [[i.id, i.hours] as const] : [])));
  const delta = new Map<string, number>();
  for (const change of proposal.changes) {
    if (change.type !== "task_date" || !checked.includes(change.changeId)) continue;
    const hours = hoursOf.get(`t:${change.taskId}`) ?? 1;
    if (change.before.date) delta.set(change.before.date, (delta.get(change.before.date) ?? 0) - hours);
    delta.set(change.after.date, (delta.get(change.after.date) ?? 0) + hours);
  }
  if (delta.size === 0) return null;
  const out = new Map<string, number>();
  for (const day of range.days) {
    if (day.hours === null) continue;
    out.set(day.date, Math.max(0, day.hours + (delta.get(day.date) ?? 0)));
  }
  return out;
}

/** Wraps the calendar body: the open proposal, its after-hours and the day alerts, for every view and Estilo. */
export function CalendarioOverlayProvider({ range, children }: { range: CalendarioRange; children: ReactNode }) {
  const proposalState = useProposal();
  const { proposal, checked } = proposalState;
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const ask = useActionMutation((vars: { alert: DayAlert; name: "propose_redistribution" | "resolve_overlap"; input: unknown }) => runProposingToolAction(vars.name, vars.input), {
    errorContext: "calendario",
    setData: (_qc, p) => proposalState.open(p),
  });

  const value = useMemo<CalendarioOverlay>(() => {
    const entries = proposal ? overlayEntries(proposal, checked) : [];
    const byDate = new Map<string, typeof entries>();
    for (const entry of entries) {
      if (!entry.date) continue;
      byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
    }
    const after = afterHoursOf(proposal, checked, range);
    return {
      proposal,
      checked,
      entries,
      originals: proposal ? originalItemIds(proposal, checked) : new Set(),
      entriesByDate: byDate,
      afterHours: (date) => after?.get(date) ?? null,
      alerts: buildDayAlerts(range.days),
      pendingKey,
      onAlert: (alert) => {
        if (ask.isPending) return;
        setPendingKey(`${alert.kind}:${alert.date}`);
        if (alert.kind === "overload") {
          ask.mutate({ alert, name: "propose_redistribution", input: { date: alert.date, target: "spread" } }, { onSettled: () => setPendingKey(null) });
          return;
        }
        const events = range.items.flatMap((i) => (i.kind === "event" && i.date === alert.date && !i.allDay ? [{ id: i.eventId, start: i.start, end: i.end }] : []));
        const pair = overlaps(events)[0];
        if (!pair) {
          setPendingKey(null);
          return;
        }
        ask.mutate({ alert, name: "resolve_overlap", input: { eventIds: pair } }, { onSettled: () => setPendingKey(null) });
      },
    };
  }, [proposal, checked, range, pendingKey, ask]);

  return <CalendarioOverlayContext.Provider value={value}>{children}</CalendarioOverlayContext.Provider>;
}
