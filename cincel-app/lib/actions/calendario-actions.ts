"use server";

import { toActionResult } from "@/lib/actions/action-result";
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

/**
 * Calendario writes (BE §8.1, §8.3, §12): the direct UI paths. Every function
 * returns an `ActionResult`; the stubs return `NOT_IMPLEMENTED` ("Esta función
 * todavía no está disponible.") until the owning issue replaces the body and
 * flips its entry in `calendario-actions.flags.ts`. The asistente reaches the
 * same repository code only through `apply_proposal`.
 */

export async function createMeetingAction(input: MeetingDraft): Promise<ActionResult<CalEventItem>> {
  return toActionResult(async () => notImplementedAction("createMeetingAction", input));
}

export async function updateMeetingAction(
  eventId: string,
  patch: MeetingPatch & { notify?: boolean },
): Promise<ActionResult<CalEventItem>> {
  return toActionResult(async () => notImplementedAction("updateMeetingAction", eventId, patch));
}

export async function cancelMeetingAction(eventId: string, opts: { notify: boolean }): Promise<ActionResult<{ eventId: string }>> {
  return toActionResult(async () => notImplementedAction("cancelMeetingAction", eventId, opts));
}

/** Organizer only: creates or patches the Google event of a meeting that is not (yet) there. */
export async function retryMeetingSyncAction(eventId: string): Promise<ActionResult<CalEventItem>> {
  return toActionResult(async () => notImplementedAction("retryMeetingSyncAction", eventId));
}

export async function refreshGoogleEventsAction(opts?: { force?: boolean }): Promise<ActionResult<{ syncedAt: string | null }>> {
  return toActionResult(async () => notImplementedAction("refreshGoogleEventsAction", opts));
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
