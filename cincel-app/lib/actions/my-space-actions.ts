"use server";

import { toActionResult } from "@/lib/actions/action-result";
import { requireCapabilityUser } from "@/lib/auth/session";
import * as notesChecklists from "@/lib/my-space/notes-checklists";
import * as reminderService from "@/lib/my-space/reminder-service";
import type { Checklist, ChecklistItem, Note, ParsedReminder, Reminder } from "@/lib/types/redesign";
import type { ActionResult } from "@/lib/types/schedule";

/**
 * Mi espacio: notes, checklists and reminders (redesign BE §7.5). Owner-only;
 * repositories are `ownerScoped` instances. A row of someone else →
 * `FORBIDDEN`, a missing row → `NOT_FOUND`; linked `projectId` / `taskId` must
 * be visible to the caller. Mi espacio reads these lists through TanStack
 * Query (`me.notes`, `me.checklists`, `me.reminders`) and its mutations patch
 * that cache, so nothing here revalidates `/mi-espacio`. The mutations the UI
 * calls return `ActionResult` (`{ ok: false, error }` with the same codes they
 * used to throw); the assistant unwraps them.
 */

// ── Notes ───────────────────────────────────────────────────────────────────

/** Live notes, pinned first, then `updatedAt desc`. */
export async function fetchNotesAction(): Promise<Note[]> {
  const user = await requireCapabilityUser();
  return notesChecklists.listNotes(user);
}

/** Errors: `INVALID` (both empty; body > 20 000; project not visible), `FORBIDDEN`. */
export async function createNoteAction(
  ...args: Parameters<typeof createNoteActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createNoteActionImpl>>>> {
  return toActionResult(() => createNoteActionImpl(...args));
}

async function createNoteActionImpl(input: {
  title?: string;
  body?: string;
  color?: Note["color"];
  pinned?: boolean;
  projectId?: string | null;
}): Promise<Note> {
  const user = await requireCapabilityUser();
  return notesChecklists.createNote(user, input);
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID`. */
export async function updateNoteAction(
  ...args: Parameters<typeof updateNoteActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateNoteActionImpl>>>> {
  return toActionResult(() => updateNoteActionImpl(...args));
}

async function updateNoteActionImpl(id: string, patch: Partial<Omit<Note, "id" | "updatedAt">>): Promise<Note> {
  const user = await requireCapabilityUser();
  return notesChecklists.updateNote(user, id, patch);
}

/** Soft delete. Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function archiveNoteAction(
  ...args: Parameters<typeof archiveNoteActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof archiveNoteActionImpl>>>> {
  return toActionResult(() => archiveNoteActionImpl(...args));
}

async function archiveNoteActionImpl(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  await notesChecklists.archiveNote(user, id);
}

/** Undo of `archiveNoteAction` (clears `deleted_at`). Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function restoreNoteAction(
  ...args: Parameters<typeof restoreNoteActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof restoreNoteActionImpl>>>> {
  return toActionResult(() => restoreNoteActionImpl(...args));
}

async function restoreNoteActionImpl(id: string): Promise<Note> {
  const user = await requireCapabilityUser();
  return notesChecklists.restoreNote(user, id);
}

// ── Checklists ──────────────────────────────────────────────────────────────

/** Live checklists, items by `sortOrder`. */
export async function fetchChecklistsAction(): Promise<Checklist[]> {
  const user = await requireCapabilityUser();
  return notesChecklists.listChecklists(user);
}

/** Errors: `INVALID`, `FORBIDDEN`. */
export async function createChecklistAction(
  ...args: Parameters<typeof createChecklistActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createChecklistActionImpl>>>> {
  return toActionResult(() => createChecklistActionImpl(...args));
}

async function createChecklistActionImpl(input: { title: string; items?: string[]; projectId?: string }): Promise<Checklist> {
  const user = await requireCapabilityUser();
  return notesChecklists.createChecklist(user, input);
}

/** Appends an item. Errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID`. */
export async function addChecklistItemAction(
  ...args: Parameters<typeof addChecklistItemActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof addChecklistItemActionImpl>>>> {
  return toActionResult(() => addChecklistItemActionImpl(...args));
}

async function addChecklistItemActionImpl(checklistId: string, text: string): Promise<ChecklistItem> {
  const user = await requireCapabilityUser();
  return notesChecklists.addChecklistItem(user, checklistId, text);
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function toggleChecklistItemAction(
  ...args: Parameters<typeof toggleChecklistItemActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof toggleChecklistItemActionImpl>>>> {
  return toActionResult(() => toggleChecklistItemActionImpl(...args));
}

async function toggleChecklistItemActionImpl(itemId: string, done: boolean): Promise<ChecklistItem> {
  const user = await requireCapabilityUser();
  return notesChecklists.toggleChecklistItem(user, itemId, done);
}

/** `ids` = exactly the checklist's item ids. Errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID`. */
export async function reorderChecklistItemsAction(checklistId: string, ids: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  await notesChecklists.reorderChecklistItems(user, checklistId, ids);
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function archiveChecklistAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  await notesChecklists.archiveChecklist(user, id);
}

// ── Reminders ───────────────────────────────────────────────────────────────

/** Open reminders by `dueAt` (default now − 1 day … now + 30 days). Errors: `INVALID`. */
export async function fetchRemindersAction(input: { from?: string; to?: string }): Promise<Reminder[]> {
  const user = await requireCapabilityUser();
  return reminderService.listReminders(user, input);
}

/** Natural-language parse (BE §8.4), ≤ 280 chars. Errors: `INVALID`. Auth: staff. */
export async function parseReminderTextAction(text: string): Promise<ParsedReminder> {
  await requireCapabilityUser();
  return reminderService.parseText(text);
}

/** Errors: `INVALID`, `PAST_TIME` (dueAt < now − 60 s), `FORBIDDEN`. */
export async function createReminderAction(
  ...args: Parameters<typeof createReminderActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createReminderActionImpl>>>> {
  return toActionResult(() => createReminderActionImpl(...args));
}

async function createReminderActionImpl(input: {
  text: string;
  dueAt: string;
  repeat?: Reminder["repeat"];
  channels?: ("app" | "email")[];
  taskId?: string;
  projectId?: string;
}): Promise<Reminder> {
  const user = await requireCapabilityUser();
  return reminderService.createReminder(user, input);
}

/**
 * `dueAt = until`, `firedAt = null`. Errors: `NOT_FOUND`, `FORBIDDEN`, `PAST_TIME`.
 * Only the assistant calls it.
 */
export async function snoozeReminderAction(id: string, until: string): Promise<Reminder> {
  const user = await requireCapabilityUser();
  return reminderService.snoozeReminder(user, id, until);
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`. Only the assistant calls it. */
export async function cancelReminderAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  await reminderService.cancelReminder(user, id);
}
