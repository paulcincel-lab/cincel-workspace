"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { toActionResult } from "@/lib/actions/action-result";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { cancelMeeting, createMeeting, updateMeeting } from "@/lib/calendario/meetings";
import { db } from "@/lib/db/client";
import { calendarEvents } from "@/lib/db/schema";
import { actionCodeOf, refreshPrimaryEvents, writeMeetingToGoogle } from "@/lib/google/calendar-events-sync";
import * as calendarEventsRepository from "@/lib/repositories/calendar-events-repository";
import * as syncRepository from "@/lib/repositories/google-calendar-sync-repository";
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
import { CancelMeetingOptsSchema, MeetingDraftSchema, UpdateMeetingInputSchema } from "@/lib/validation/calendario";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";

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
  return toActionResult(async () => notImplementedAction("saveMeetingNotesAction", eventId, notes));
}

/** The Barra para pedir; the same function as the `propose_from_text` tool. */
export async function proposeFromTextAction(input: {
  text: string;
  view: "dia" | "semana" | "mes";
  from: string;
  to: string;
  selectedDate?: string;
}): Promise<ActionResult<Proposal>> {
  return toActionResult(async () => notImplementedAction("proposeFromTextAction", input));
}

export async function runProposingToolAction(
  name: "propose_redistribution" | "resolve_overlap" | "plan_week" | "extract_minutes" | "move_tasks",
  input: unknown,
): Promise<ActionResult<Proposal>> {
  return toActionResult(async () => notImplementedAction("runProposingToolAction", name, input));
}

export async function applyProposalAction(id: string, changeIds?: string[]): Promise<ActionResult<ApplyProposalResult>> {
  return toActionResult(async () => notImplementedAction("applyProposalAction", id, changeIds));
}

export async function cancelProposalAction(id: string): Promise<ActionResult<{ id: string }>> {
  return toActionResult(async () => notImplementedAction("cancelProposalAction", id));
}

export async function undoProposalAction(undoToken: string): Promise<ActionResult<UndoProposalResult>> {
  return toActionResult(async () => notImplementedAction("undoProposalAction", undoToken));
}

export async function sendAgendaAction(eventId: string, items: string[]): Promise<ActionResult<{ sent: number }>> {
  return toActionResult(async () => notImplementedAction("sendAgendaAction", eventId, items));
}

export async function sendMinutesAction(eventId: string): Promise<ActionResult<{ sent: number }>> {
  return toActionResult(async () => notImplementedAction("sendMinutesAction", eventId));
}

export async function setTaskEstimatedHoursAction(taskId: string, hours: number | null): Promise<ActionResult<TaskDetail>> {
  return toActionResult(async () => notImplementedAction("setTaskEstimatedHoursAction", taskId, hours));
}
