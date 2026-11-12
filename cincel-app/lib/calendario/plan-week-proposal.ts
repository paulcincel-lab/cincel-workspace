/**
 * `plan_week` as a `planear_semana` proposal and the notification that follows
 * its apply (BE §10.4, §11.2). Server-only.
 */
import "server-only";

import { computePlanWeek, type CollectedPlanWeek, type PlanWeekScope } from "@/lib/calendario/plan-week-data";
import { cellsAfterPlacements, type PlanWeekCell, type PlanWeekResult } from "@/lib/calendario/plan-week";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify";
import { createProposal } from "@/lib/repositories/proposals-repository";
import { mondayOf } from "@/lib/time-tracking/local-time";
import type { Proposal, ProposalChange } from "@/lib/types/calendario";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** `2026-11-16` as "16 nov". */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]}`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function planWeekTitle(weekStart: string): string {
  return `Planear la semana del ${shortDate(weekStart)}`;
}

export function planWeekLine(placed: number, deferred: number): string {
  const first = `${placed} ${plural(placed, "tarea acomodada", "tareas acomodadas")}`;
  if (deferred === 0) return first;
  return `${first} · ${deferred} ${plural(deferred, "no cupo", "no cupieron")}`;
}

/** One `task_date` change per placement, in placement order, with `staffId` of the lane. */
export function planWeekChanges(collected: CollectedPlanWeek, plan: PlanWeekResult): ProposalChange[] {
  const byId = new Map(collected.backlog.map((t) => [t.taskId, t]));
  return plan.placements.flatMap((p, i): ProposalChange[] => {
    const task = byId.get(p.taskId);
    if (!task) return [];
    return [
      {
        changeId: `c${i + 1}`,
        type: "task_date",
        taskId: task.taskId,
        title: task.title,
        projectName: task.projectName,
        before: { date: task.commitmentDate, field: "commitmentDate" },
        after: { date: p.date },
        staffId: p.staffId,
      },
    ];
  });
}

export type PlanWeekProposal = {
  proposal: Proposal;
  /** Hours per cell after the proposal, for the board. */
  cells: PlanWeekCell[];
};

/** Computes the plan and writes the proposal row. Changes nothing else. */
export async function proposePlanWeek(
  user: AuthenticatedUser,
  scope: PlanWeekScope,
  opts?: { threadId?: string; toolCallId?: string },
): Promise<PlanWeekProposal> {
  const { collected, plan } = await computePlanWeek(user, scope);
  const changes = planWeekChanges(collected, plan);
  const { weekStart, days } = collected.input;
  const proposal = await createProposal(
    user,
    "planear_semana",
    {
      title: planWeekTitle(weekStart),
      line: planWeekLine(changes.length, plan.deferred.length),
      changes,
      deferred: plan.deferred,
      range: { from: days[0] ?? weekStart, to: days[days.length - 1] ?? weekStart },
    },
    opts,
  );
  return { proposal, cells: plan.cells };
}

/** Recomputes the after cells of a stored proposal from the board's current cells. */
export function proposalCells(cells: PlanWeekCell[], proposal: Pick<Proposal, "changes">, hours: Record<string, number>): PlanWeekCell[] {
  const placements = proposal.changes.flatMap((c) =>
    c.type === "task_date" && c.staffId ? [{ taskId: c.taskId, staffId: c.staffId, date: c.after.date }] : [],
  );
  return cellsAfterPlacements(cells, placements, hours);
}

/**
 * After a `planear_semana` proposal is applied: each owner other than the
 * viewer is told once, with the number of their tasks that were planned.
 * `appliedChangeIds` limits it to the changes that were applied.
 */
export async function notifyPlanWeekOwners(
  user: AuthenticatedUser,
  proposal: Pick<Proposal, "id" | "kind" | "changes">,
  appliedChangeIds?: string[],
): Promise<{ notified: number }> {
  if (proposal.kind !== "planear_semana") return { notified: 0 };
  const applied = appliedChangeIds ? new Set(appliedChangeIds) : null;
  const perOwner = new Map<string, { count: number; first: string }>();
  for (const change of proposal.changes) {
    if (change.type !== "task_date" || !change.staffId || change.staffId === user.member.id) continue;
    if (applied && !applied.has(change.changeId)) continue;
    const entry = perOwner.get(change.staffId) ?? { count: 0, first: change.after.date };
    entry.count += 1;
    if (change.after.date < entry.first) entry.first = change.after.date;
    perOwner.set(change.staffId, entry);
  }
  let notified = 0;
  for (const [staffId, { count, first }] of [...perOwner].sort(([a], [b]) => a.localeCompare(b))) {
    const weekStart = mondayOf(first);
    const result = await notify(
      db,
      [staffId],
      {
        kind: "asignacion",
        title: "Tu semana cambió",
        body: `${user.member.name} planeó ${count} ${plural(count, "tarea tuya", "tareas tuyas")} para la semana del ${shortDate(weekStart)}.`,
        url: `/calendario?vista=semana&fecha=${weekStart}`,
        dedupeKey: `planear-semana:${proposal.id}:${staffId}`,
        actorId: user.member.id,
      },
    );
    notified += result.created;
  }
  return { notified };
}
