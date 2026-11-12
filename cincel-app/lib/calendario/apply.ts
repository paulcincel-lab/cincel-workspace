/** Apply and undo a proposal (BE §6.3, ADR 0007). Server-only. */
import "server-only";

import { and, eq } from "drizzle-orm";

import { bulkUpdateTasksAction, createUserTaskAction, deleteTaskAction } from "@/lib/actions/tasks-actions";
import { cancelMeetingAction, createMeetingAction, updateMeetingAction } from "@/lib/actions/calendario-actions";
import { unwrapActionResult } from "@/lib/actions/action-result";
import { recordViaAsistente } from "@/lib/assistant/via-asistente";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { applyToast, undoToast } from "@/lib/calendario/copy";
import { notifyPlanWeekOwners } from "@/lib/calendario/plan-week-proposal";
import {
  SKIP_CHANGED,
  SKIP_FAILED,
  SKIP_GONE,
  SKIP_NO_PERMISSION,
  UNDO_WINDOW_MINUTES,
  isStale,
  undoPlan,
  type UndoPayload,
} from "@/lib/calendario/proposals";
import { db } from "@/lib/db/client";
import { calendarEventAttendees, calendarEvents, meetingDecisions, meetingMinutes } from "@/lib/db/schema";
import { actionErrorCode } from "@/lib/errors";
import { getEventItem } from "@/lib/repositories/calendar-events-repository";
import { retractDecision } from "@/lib/repositories/meeting-minutes-repository";
import {
  findRecordByUndoToken,
  getProposalRecord,
  hashUndoToken,
  markApplied,
  newUndoToken,
  setProposalStatus,
} from "@/lib/repositories/proposals-repository";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import type { AppliedChange, ApplyProposalResult, ProposalChange, UndoProposalResult } from "@/lib/types/calendario";

/** `apply_proposal` and `undo_proposal`: 60 per 10 min per staff (BE §14). */
export const proposalRateLimiter = createRateLimiter({ limit: 60, windowMs: 10 * 60 * 1000 });

/** Proposals being applied right now in this process, so a double click cannot write twice. */
const applying = new Set<string>();

type Skipped = { changeId: string; reason: string };
type TaskDateChange = Extract<ProposalChange, { type: "task_date" }>;

/** The card text of an error code coming out of an action or repository. */
function skipReason(error: unknown): string {
  const code = actionErrorCode(error);
  if (code === "FORBIDDEN" || code === "NOT_ORGANIZER") return SKIP_NO_PERMISSION;
  if (code === "NOT_FOUND" || code === "TASK_NOT_FOUND") return SKIP_GONE;
  return SKIP_FAILED;
}

function checkRate(user: AuthenticatedUser): void {
  if (!proposalRateLimiter.hit(user.member.id).allowed) throw new Error("RATE_LIMITED");
}

/** Only organizer and staff attendees may write a decision of a meeting (BE §13). */
async function canWriteDecisions(user: AuthenticatedUser, minutesId: string): Promise<{ ok: boolean; projectId: string | null; exists: boolean }> {
  const [row] = await db
    .select({ eventId: meetingMinutes.eventId, projectId: meetingMinutes.projectId, organizerId: calendarEvents.organizerId, eventProject: calendarEvents.projectId })
    .from(meetingMinutes)
    .innerJoin(calendarEvents, eq(calendarEvents.id, meetingMinutes.eventId))
    .where(eq(meetingMinutes.id, minutesId))
    .limit(1);
  if (!row) return { ok: false, projectId: null, exists: false };
  const projectId = row.projectId ?? row.eventProject ?? null;
  if (row.organizerId === user.member.id) return { ok: true, projectId, exists: true };
  const [attendee] = await db
    .select({ id: calendarEventAttendees.id })
    .from(calendarEventAttendees)
    .where(and(eq(calendarEventAttendees.eventId, row.eventId), eq(calendarEventAttendees.staffId, user.member.id)))
    .limit(1);
  return { ok: Boolean(attendee), projectId, exists: true };
}

async function applyTaskDates(
  user: AuthenticatedUser,
  title: string,
  changes: TaskDateChange[],
  applied: AppliedChange[],
  skipped: Skipped[],
): Promise<void> {
  const viewer = viewerScopeOf(user);
  const caps = resolveActivitiesCapabilities(user);
  const groups = new Map<string, TaskDateChange[]>();
  for (const change of changes) {
    const task = await tasksRepository.getTask(change.taskId);
    if (!task) {
      skipped.push({ changeId: change.changeId, reason: SKIP_GONE });
      continue;
    }
    if ((task.kind === "admin" && !viewer.isAdmin) || !caps.canCreateActivity) {
      skipped.push({ changeId: change.changeId, reason: SKIP_NO_PERMISSION });
      continue;
    }
    if (isStale(change, task[change.before.field])) {
      skipped.push({ changeId: change.changeId, reason: SKIP_CHANGED });
      continue;
    }
    const key = `${change.after.date}|${change.before.field}`;
    groups.set(key, [...(groups.get(key) ?? []), change]);
  }
  // One bulk call per date (and date field).
  for (const group of groups.values()) {
    const first = group[0];
    const byTask = new Map(group.map((c) => [c.taskId, c]));
    let outcome: { updated: string[]; skipped: { id: string; reason: string }[] };
    try {
      outcome = unwrapActionResult(
        await bulkUpdateTasksAction([...byTask.keys()], { dueDate: first.after.date, dueField: first.before.field }),
      );
    } catch (error) {
      for (const change of group) skipped.push({ changeId: change.changeId, reason: skipReason(error) });
      continue;
    }
    for (const id of outcome.updated) {
      const change = byTask.get(id);
      if (!change) continue;
      const undo: UndoPayload = { type: "task_date", field: change.before.field, before: change.before.date, after: change.after.date };
      applied.push({ changeId: change.changeId, entity: "task", entityId: id, undo });
      await recordViaAsistente({ entity: "task", entityId: id, actorId: user.member.id, summary: title });
    }
    for (const item of outcome.skipped) {
      const change = byTask.get(item.id);
      if (change) skipped.push({ changeId: change.changeId, reason: skipReason(item.reason) });
    }
  }
}

async function applyOne(user: AuthenticatedUser, title: string, change: ProposalChange, applied: AppliedChange[], skipped: Skipped[]): Promise<void> {
  const skip = (reason: string): void => {
    skipped.push({ changeId: change.changeId, reason });
  };
  try {
    switch (change.type) {
      case "event_create": {
        const event = unwrapActionResult(await createMeetingAction(change.draft));
        applied.push({ changeId: change.changeId, entity: "event", entityId: event.eventId, undo: { type: "event_create" } satisfies UndoPayload });
        return;
      }
      case "event_update": {
        const event = await getEventItem(user, change.eventId);
        if (!event) return skip(SKIP_GONE);
        if (!event.canEdit) return skip(SKIP_NO_PERMISSION);
        const current = { title: event.title, start: event.start, end: event.end, location: event.location };
        if (isStale(change, current)) return skip(SKIP_CHANGED);
        unwrapActionResult(await updateMeetingAction(change.eventId, { ...change.after, notify: change.notify }));
        const undo: UndoPayload = { type: "event_update", before: change.before, after: change.after };
        applied.push({ changeId: change.changeId, entity: "event", entityId: change.eventId, undo });
        return;
      }
      case "event_cancel": {
        const event = await getEventItem(user, change.eventId);
        if (!event) return skip(SKIP_GONE);
        if (!event.canEdit) return skip(SKIP_NO_PERMISSION);
        unwrapActionResult(await cancelMeetingAction(change.eventId, { notify: change.notify }));
        applied.push({ changeId: change.changeId, entity: "event", entityId: change.eventId, undo: { type: "event_cancel" } satisfies UndoPayload });
        return;
      }
      case "task_create": {
        const caps = resolveActivitiesCapabilities(user);
        if (!caps.canCreateActivity) return skip(SKIP_NO_PERMISSION);
        // Assigning others needs canChangeResponsible; otherwise the task is the viewer's ("Te la asigno a ti").
        const managerId = change.draft.managerId && !caps.canChangeResponsible ? user.member.id : change.draft.managerId;
        const task = unwrapActionResult(
          await createUserTaskAction({
            projectId: change.draft.projectId,
            title: change.draft.title,
            notes: change.draft.sourceText || null,
            workflowId: change.draft.tramoId,
            managerId,
            commitmentDate: change.draft.commitmentDate,
          }),
        );
        applied.push({ changeId: change.changeId, entity: "task", entityId: task.id, undo: { type: "task_create" } satisfies UndoPayload });
        await recordViaAsistente({ entity: "task", entityId: task.id, actorId: user.member.id, summary: title });
        return;
      }
      case "decision": {
        const access = await canWriteDecisions(user, change.minutesId);
        if (!access.exists) return skip(SKIP_GONE);
        if (!access.ok) return skip(SKIP_NO_PERMISSION);
        let historyEventId: string | null = null;
        if (access.projectId) {
          const entry = await recordViaAsistente({
            entity: "project",
            entityId: access.projectId,
            actorId: user.member.id,
            summary: `Decisión: ${change.text}`,
          });
          historyEventId = entry.id;
        }
        const [row] = await db
          .insert(meetingDecisions)
          .values({ minutesId: change.minutesId, projectId: access.projectId, text: change.text, historyEventId })
          .returning({ id: meetingDecisions.id });
        const undo: UndoPayload = { type: "decision", text: change.text, projectId: access.projectId };
        applied.push({ changeId: change.changeId, entity: "decision", entityId: row.id, undo });
        return;
      }
      case "task_date":
        return;
    }
  } catch (error) {
    skip(skipReason(error));
  }
}

/**
 * Applies a proposal (or only `changeIds`) for its owner. Errors: FORBIDDEN (not the owner),
 * STALE (not `propuesta`), EXPIRED, INVALID (unknown change ids), RATE_LIMITED.
 */
export async function applyProposal(user: AuthenticatedUser, proposalId: string, changeIds?: string[]): Promise<ApplyProposalResult> {
  checkRate(user);
  const record = await getProposalRecord(user, proposalId);
  if (!record || record.staffId !== user.member.id) throw new Error("FORBIDDEN");
  const { proposal } = record;
  if (proposal.status !== "propuesta") throw new Error("STALE");
  if (record.expiresAt.getTime() < Date.now()) throw new Error("EXPIRED");

  const wanted = changeIds ? new Set(changeIds) : null;
  if (wanted) {
    const known = new Set(proposal.changes.map((c) => c.changeId));
    if (wanted.size === 0 || [...wanted].some((id) => !known.has(id))) throw new Error("INVALID: changeIds");
  }
  const selected = wanted ? proposal.changes.filter((c) => wanted.has(c.changeId)) : proposal.changes;

  if (applying.has(proposalId)) throw new Error("STALE");
  applying.add(proposalId);
  try {
    const applied: AppliedChange[] = [];
    const skipped: Skipped[] = [];
    await applyTaskDates(
      user,
      proposal.title,
      selected.filter((c): c is TaskDateChange => c.type === "task_date"),
      applied,
      skipped,
    );
    for (const change of selected) {
      if (change.type !== "task_date") await applyOne(user, proposal.title, change, applied, skipped);
    }

    const order = new Map(proposal.changes.map((c, i) => [c.changeId, i]));
    applied.sort((a, b) => (order.get(a.changeId) ?? 0) - (order.get(b.changeId) ?? 0));

    const dates = new Set(applied.flatMap((a) => (a.undo as UndoPayload).type === "task_date" ? [(a.undo as Extract<UndoPayload, { type: "task_date" }>).after] : []));
    const toastBase = { applied: applied.map((a) => a.changeId), skipped };
    const toast = applyToast(toastBase, proposal.kind, dates.size === 1 ? [...dates][0] : null);
    if (applied.length === 0) {
      return { proposalId, applied: [], skipped, undoToken: null, undoExpiresAt: null, toast };
    }

    const now = new Date();
    const token = newUndoToken();
    const undoExpiresAt = new Date(now.getTime() + UNDO_WINDOW_MINUTES * 60 * 1000);
    const complete = skipped.length === 0 && applied.length === proposal.changes.length;
    const saved = await markApplied(proposalId, complete ? "aplicada" : "parcial", {
      applied,
      undoTokenHash: hashUndoToken(token),
      undoExpiresAt,
      appliedAt: now,
    });
    if (!saved) throw new Error("STALE");
    if (proposal.kind === "planear_semana") {
      // Other owners hear once about their planned tasks; a failed notice never undoes the apply.
      await notifyPlanWeekOwners(user, proposal, applied.map((a) => a.changeId)).catch(() => undefined);
    }
    return { ...toastBase, proposalId, undoToken: token, undoExpiresAt: undoExpiresAt.toISOString(), toast };
  } finally {
    applying.delete(proposalId);
  }
}

/** What each applied change holds now, for `undoPlan` (undefined: the row is gone). */
async function currentValues(user: AuthenticatedUser, applied: AppliedChange[]): Promise<Record<string, unknown>> {
  const current: Record<string, unknown> = {};
  for (const item of applied) {
    const undo = item.undo as UndoPayload;
    if (undo.type === "task_date") {
      const task = await tasksRepository.getTask(item.entityId);
      current[item.changeId] = task ? task[undo.field] : undefined;
    } else if (undo.type === "event_update") {
      const event = await getEventItem(user, item.entityId);
      current[item.changeId] = event ? { title: event.title, start: event.start, end: event.end, location: event.location } : undefined;
    } else if (undo.type === "event_create" || undo.type === "event_cancel") {
      current[item.changeId] = (await getEventItem(user, item.entityId)) ? "exists" : undefined;
    } else if (undo.type === "task_create") {
      current[item.changeId] = (await tasksRepository.getTask(item.entityId)) ? "exists" : undefined;
    } else {
      const [row] = await db.select({ id: meetingDecisions.id }).from(meetingDecisions).where(eq(meetingDecisions.id, item.entityId)).limit(1);
      current[item.changeId] = row ? "exists" : undefined;
    }
  }
  return current;
}

/**
 * Undoes an applied proposal with its token, restoring only what still equals what apply wrote.
 * Errors: FORBIDDEN (unknown token or not the owner), STALE (already undone), UNDO_EXPIRED, RATE_LIMITED.
 */
export async function undoProposal(user: AuthenticatedUser, undoToken: string): Promise<UndoProposalResult> {
  checkRate(user);
  const record = await findRecordByUndoToken(user, undoToken);
  if (!record || record.staffId !== user.member.id) throw new Error("FORBIDDEN");
  const { proposal } = record;
  if (proposal.status !== "aplicada" && proposal.status !== "parcial") throw new Error("STALE");
  if (!record.undoExpiresAt || record.undoExpiresAt.getTime() < Date.now()) throw new Error("UNDO_EXPIRED");

  if (applying.has(proposal.id)) throw new Error("STALE");
  applying.add(proposal.id);
  try {
    const plan = undoPlan(record.applied, await currentValues(user, record.applied));
    const restored: string[] = [];
    const skipped: Skipped[] = [...plan.skipped];
    for (const item of plan.restore) {
      try {
        const undo = item.undo as UndoPayload;
        if (undo.type === "task_date") {
          const result = unwrapActionResult(await bulkUpdateTasksAction([item.entityId], { dueDate: undo.before, dueField: undo.field }));
          if (!result.updated.includes(item.entityId)) {
            skipped.push({ changeId: item.changeId, reason: skipReason(result.skipped[0]?.reason ?? "") });
            continue;
          }
        } else if (undo.type === "event_update") {
          unwrapActionResult(await updateMeetingAction(item.entityId, { ...undo.before, notify: true }));
        } else if (undo.type === "event_create") {
          unwrapActionResult(await cancelMeetingAction(item.entityId, { notify: true }));
        } else if (undo.type === "task_create") {
          unwrapActionResult(await deleteTaskAction(item.entityId));
        } else if (undo.type === "decision") {
          // Removes the row and writes "Decisión retirada" in the project history, in one transaction.
          await retractDecision(item.entityId, user.member.id);
        }
        restored.push(item.changeId);
      } catch (error) {
        skipped.push({ changeId: item.changeId, reason: skipReason(error) });
      }
    }
    await setProposalStatus(proposal.id, "deshecha", { undoneAt: new Date() });
    return { restored, skipped, toast: undoToast({ restored, skipped }) };
  } finally {
    applying.delete(proposal.id);
  }
}
