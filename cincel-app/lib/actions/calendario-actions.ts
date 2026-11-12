"use server";

import { toActionResult } from "@/lib/actions/action-result";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
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
import { ApplyProposalToolSchema, ProposeFromTextToolSchema, UndoProposalToolSchema } from "@/lib/validation/calendario";
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

export async function sendAgendaAction(eventId: string, items: string[]): Promise<ActionResult<{ sent: number }>> {
  return toActionResult(async () => notImplementedAction("sendAgendaAction", eventId, items));
}

export async function sendMinutesAction(eventId: string): Promise<ActionResult<{ sent: number }>> {
  return toActionResult(async () => notImplementedAction("sendMinutesAction", eventId));
}

export async function setTaskEstimatedHoursAction(taskId: string, hours: number | null): Promise<ActionResult<TaskDetail>> {
  return toActionResult(async () => notImplementedAction("setTaskEstimatedHoursAction", taskId, hours));
}
