"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { toActionResult } from "@/lib/actions/action-result";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { resolveActivitiesCapabilities, resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { cancelMeeting, createMeeting, updateMeeting } from "@/lib/calendario/meetings";
import { db } from "@/lib/db/client";
import { calendarEvents } from "@/lib/db/schema";
import { actionCodeOf, refreshPrimaryEvents, writeMeetingToGoogle } from "@/lib/google/calendar-events-sync";
import * as calendarEventsRepository from "@/lib/repositories/calendar-events-repository";
import * as syncRepository from "@/lib/repositories/google-calendar-sync-repository";
import { sendMinutes } from "@/lib/calendario/minutes-service";
import * as meetingMinutesRepository from "@/lib/repositories/meeting-minutes-repository";
import { sendAgenda } from "@/lib/calendario/agenda-mail";
import { scopeTaskDto, viewerScopeOf } from "@/lib/auth/viewer-scope";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import { notImplementedAction } from "@/lib/stubs";
import type {
  ApplyProposalResult,
  CalEventItem,
  MeetingDraft,
  MeetingPatch,
  Proposal,
  UndoProposalResult,
} from "@/lib/types/calendario";
import type { TaskDetail } from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";
import {
  ApplyProposalToolSchema,
  CancelMeetingOptsSchema,
  EstimatedHoursSchema,
  MeetingDraftSchema,
  MeetingNotesSchema,
  ProposeFromTextToolSchema,
  UndoProposalToolSchema,
  UpdateMeetingInputSchema,
} from "@/lib/validation/calendario";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";

/** The proposing tools a button on the page may run (BE §12). */
const RUNNABLE_TOOLS = ["propose_redistribution", "resolve_overlap", "plan_week", "extract_minutes", "move_tasks"] as const;

/**
 * Calendario writes (BE §8.1, §8.3, §12): the direct UI paths. Every function
 * returns an `ActionResult`; the stubs return `NOT_IMPLEMENTED` ("Esta función
 * todavía no está disponible.") until the owning issue replaces the body and
 * flips its entry in `calendario-actions.flags.ts`. The asistente reaches the
 * same repository code only through `apply_proposal`.
 */

/** Zod first, then the session and `canViewCalendar` again here; linking a project needs seeing it (checked in the repository). */
async function meetingUser() {
  const user = await requireCapabilityUser();
  if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
  return user;
}

export async function createMeetingAction(input: MeetingDraft): Promise<ActionResult<CalEventItem>> {
  return toActionResult(async () => {
    const draft = parseInput(MeetingDraftSchema, input);
    return createMeeting(await meetingUser(), draft);
  });
}

export async function updateMeetingAction(
  eventId: string,
  patch: MeetingPatch & { notify?: boolean },
): Promise<ActionResult<CalEventItem>> {
  return toActionResult(async () => {
    const id = parseInput(UuidSchema, eventId);
    const parsed = parseInput(UpdateMeetingInputSchema, patch);
    return updateMeeting(await meetingUser(), id, parsed);
  });
}

export async function cancelMeetingAction(eventId: string, opts: { notify: boolean }): Promise<ActionResult<{ eventId: string }>> {
  return toActionResult(async () => {
    const id = parseInput(UuidSchema, eventId);
    const parsed = parseInput(CancelMeetingOptsSchema, opts);
    return cancelMeeting(await meetingUser(), id, parsed);
  });
}

/** Organizer only: creates or patches the Google event of a meeting that is not (yet) there. */
export async function retryMeetingSyncAction(eventId: string): Promise<ActionResult<CalEventItem>> {
  return toActionResult(async () => {
    const id = z.string().uuid().safeParse(eventId);
    if (!id.success) throw new Error("INVALID");
    const user = await requireCapabilityUser();
    if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");

    // Scope and role re-checked here: only the organizer of a Cincel meeting.
    const [row] = await db
      .select({ organizerId: calendarEvents.organizerId })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, id.data))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    if (row.organizerId !== user.member.id) throw new Error("NOT_ORGANIZER");

    const outcome = await writeMeetingToGoogle(id.data, "retry", { actorId: user.member.id });
    if (!outcome.ok) throw new Error(actionCodeOf(outcome.error));

    const item = await calendarEventsRepository.getEventItem(user, id.data);
    if (!item) throw new Error("NOT_FOUND");
    return item;
  });
}

/** `force` (the "Actualizar" button) is limited to 6 per 10 minutes per person (BE §14); the 5-minute freshness covers the rest. */
const refreshLimiter = createRateLimiter({ limit: 6, windowMs: 10 * 60_000 });
const RefreshInput = z.object({ force: z.boolean().optional() }).optional();

export async function refreshGoogleEventsAction(opts?: { force?: boolean }): Promise<ActionResult<{ syncedAt: string | null }>> {
  return toActionResult(async () => {
    const input = RefreshInput.safeParse(opts);
    if (!input.success) throw new Error("INVALID");
    const user = await requireCapabilityUser();
    if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
    const staffId = user.member.id;

    if (input.data?.force && !refreshLimiter.hit(staffId).allowed) throw new Error("RATE_LIMITED");

    const result = await refreshPrimaryEvents(staffId, { force: input.data?.force });
    if ("syncedAt" in result) return { syncedAt: result.syncedAt };
    const state = await syncRepository.getPrimarySyncState(staffId);
    return { syncedAt: state?.syncedAt ? state.syncedAt.toISOString() : null };
  });
}

/** Autosave, debounced on the client. */
export async function saveMeetingNotesAction(
  eventId: string,
  notes: string,
): Promise<ActionResult<{ minutesId: string; updatedAt: string }>> {
  return toActionResult(async () => {
    const id = parseInput(UuidSchema, eventId);
    const text = parseInput(MeetingNotesSchema, notes);
    const user = await requireCapabilityUser();
    // Organizer and staff attendees only; the repository re-checks it against the event.
    return meetingMinutesRepository.saveNotes(user, id, text);
  });
}

/** The Barra para pedir; the same function as the `propose_from_text` tool. */
export async function proposeFromTextAction(input: {
  text: string;
  view: "dia" | "semana" | "mes";
  from: string;
  to: string;
  selectedDate?: string;
}): Promise<ActionResult<Proposal>> {
  return toActionResult(async () => {
    const parsed = parseInput(ProposeFromTextToolSchema, input);
    const user = await proposalUser();
    // Loaded on demand: the tools registry imports modules that import this one.
    const { proposeFromText } = await import("@/lib/calendario/propose-from-text");
    const made = await proposeFromText({ user, context: { route: "/calendario" }, threadId: null }, parsed);
    if (!made.ok) throw new Error(made.error);
    return made.proposal;
  });
}

export async function runProposingToolAction(
  name: "propose_redistribution" | "resolve_overlap" | "plan_week" | "extract_minutes" | "move_tasks",
  input: unknown,
): Promise<ActionResult<Proposal>> {
  return toActionResult(async () => {
    const user = await proposalUser();
    const { findDefinedTool } = await import("@/lib/assistant/tools/index");
    const tool = (RUNNABLE_TOOLS as readonly string[]).includes(name) ? findDefinedTool(name) : undefined;
    if (!tool) throw new Error("NOT_FOUND");
    if (!tool.definition.capability(user)) throw new Error("FORBIDDEN");
    const parsed = parseInput(tool.definition.schema, input);
    const out = (await tool.definition.run({ user, context: { route: "/calendario" }, threadId: null }, parsed)) as {
      ok?: boolean;
      proposalId?: string;
      error?: string;
    };
    if (out.ok !== true || !out.proposalId) throw new Error(out.error ?? "INVALID");
    const { getProposal } = await import("@/lib/repositories/proposals-repository");
    const proposal = await getProposal(user, out.proposalId);
    if (!proposal) throw new Error("NOT_FOUND");
    return proposal;
  });
}

/** Staff session with `canViewCalendar`; the owner check of a proposal runs again inside apply, cancel and undo. */
async function proposalUser() {
  const user = await requireCapabilityUser();
  if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
  return user;
}

/** Applies a proposal or only the checked changes. Owner only. */
export async function applyProposalAction(id: string, changeIds?: string[]): Promise<ActionResult<ApplyProposalResult>> {
  return toActionResult(async () => {
    const input = parseInput(ApplyProposalToolSchema, { proposalId: id, changeIds });
    const user = await proposalUser();
    // Loaded on demand: apply.ts calls the meeting actions of this module.
    const { applyProposal } = await import("@/lib/calendario/apply");
    return applyProposal(user, input.proposalId, input.changeIds);
  });
}

/** Owner only: an open proposal becomes `cancelada`. */
export async function cancelProposalAction(id: string): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => {
    const proposalId = parseInput(UuidSchema, id);
    const user = await proposalUser();
    const { cancelProposal } = await import("@/lib/repositories/proposals-repository");
    return cancelProposal(user, proposalId);
  });
}

/** Undoes an applied proposal within 15 minutes. Owner only. */
export async function undoProposalAction(undoToken: string): Promise<ActionResult<UndoProposalResult>> {
  return toActionResult(async () => {
    const input = parseInput(UndoProposalToolSchema, { undoToken });
    const user = await proposalUser();
    const { undoProposal } = await import("@/lib/calendario/apply");
    return undoProposal(user, input.undoToken);
  });
}

/** Organizer and staff attendees only; re-checked inside `sendAgenda`. */
export async function sendAgendaAction(eventId: string, items: string[]): Promise<ActionResult<{ sent: number }>> {
  return toActionResult(async () => {
    const user = await requireCapabilityUser();
    if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
    return sendAgenda(user, eventId, items);
  });
}

export async function sendMinutesAction(eventId: string): Promise<ActionResult<{ sent: number }>> {
  return toActionResult(async () => {
    const id = parseInput(UuidSchema, eventId);
    const user = await requireCapabilityUser();
    return sendMinutes(user, id);
  });
}

export async function setTaskEstimatedHoursAction(taskId: string, hours: number | null): Promise<ActionResult<TaskDetail>> {
  return toActionResult(async () => {
    const id = parseInput(UuidSchema, taskId);
    const value = parseInput(EstimatedHoursSchema, hours);
    // Same checks as editing the task's dates: it must be visible and the actor may edit tasks.
    const user = await requireCapabilityUser();
    const viewer = viewerScopeOf(user);
    await tasksRepository.assertTaskVisible(id, viewer);
    if (!resolveActivitiesCapabilities(user).canCreateActivity) throw new Error("FORBIDDEN: task edit");
    const row = await tasksRepository.updateTask(id, { estimatedHours: value }, user.member.id);
    return scopeTaskDto(row, viewer);
  });
}
