"use server";

import { revalidateMiEspacioScreen } from "@/lib/cache/screens/mi-espacio";

import { requireCapabilityUser } from "@/lib/auth/session";
import * as notesChecklists from "@/lib/my-space/notes-checklists";
import * as reminderService from "@/lib/my-space/reminder-service";
import type { Checklist, ChecklistItem, Note, ParsedReminder, Reminder } from "@/lib/types/redesign";

/**
 * Mi espacio: notes, checklists and reminders (redesign BE §7.5). Owner-only;
 * repositories are `ownerScoped` instances. A row of someone else →
 * `FORBIDDEN`, a missing row → `NOT_FOUND`; linked `projectId` / `taskId` must
 * be visible to the caller. Writes revalidate `/mi-espacio`.
 */

// ── Notes ───────────────────────────────────────────────────────────────────

function revalidateMiEspacio() {
  revalidateMiEspacioScreen(["miEspacio"]);
}

/** Live notes, pinned first, then `updatedAt desc`. */
export async function fetchNotesAction(): Promise<Note[]> {
  const user = await requireCapabilityUser();
  return notesChecklists.listNotes(user);
}

/** Errors: `INVALID` (both empty; body > 20 000; project not visible), `FORBIDDEN`. */
export async function createNoteAction(input: {
  title?: string;
  body?: string;
  color?: Note["color"];
  pinned?: boolean;
  projectId?: string | null;
}): Promise<Note> {
  const user = await requireCapabilityUser();
  const note = await notesChecklists.createNote(user, input);
  revalidateMiEspacio();
  return note;
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID`. */
export async function updateNoteAction(id: string, patch: Partial<Omit<Note, "id" | "updatedAt">>): Promise<Note> {
  const user = await requireCapabilityUser();
  const note = await notesChecklists.updateNote(user, id, patch);
  revalidateMiEspacio();
  return note;
}

/** Soft delete. Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function archiveNoteAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  await notesChecklists.archiveNote(user, id);
  revalidateMiEspacio();
}

/** Undo of `archiveNoteAction` (clears `deleted_at`). Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function restoreNoteAction(id: string): Promise<Note> {
  const user = await requireCapabilityUser();
  const note = await notesChecklists.restoreNote(user, id);
  revalidateMiEspacio();
  return note;
}

// ── Checklists ──────────────────────────────────────────────────────────────

/** Live checklists, items by `sortOrder`. */
export async function fetchChecklistsAction(): Promise<Checklist[]> {
  const user = await requireCapabilityUser();
  return notesChecklists.listChecklists(user);
}

/** Errors: `INVALID`, `FORBIDDEN`. */
export async function createChecklistAction(input: {
  title: string;
  items?: string[];
  projectId?: string;
}): Promise<Checklist> {
  const user = await requireCapabilityUser();
  const checklist = await notesChecklists.createChecklist(user, input);
  revalidateMiEspacio();
  return checklist;
}

/** Appends an item. Errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID`. */
export async function addChecklistItemAction(checklistId: string, text: string): Promise<ChecklistItem> {
  const user = await requireCapabilityUser();
  const item = await notesChecklists.addChecklistItem(user, checklistId, text);
  revalidateMiEspacio();
  return item;
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function toggleChecklistItemAction(itemId: string, done: boolean): Promise<ChecklistItem> {
  const user = await requireCapabilityUser();
  const item = await notesChecklists.toggleChecklistItem(user, itemId, done);
  revalidateMiEspacio();
  return item;
}

/** `ids` = exactly the checklist's item ids. Errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID`. */
export async function reorderChecklistItemsAction(checklistId: string, ids: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  await notesChecklists.reorderChecklistItems(user, checklistId, ids);
  revalidateMiEspacio();
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function archiveChecklistAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  await notesChecklists.archiveChecklist(user, id);
  revalidateMiEspacio();
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
export async function createReminderAction(input: {
  text: string;
  dueAt: string;
  repeat?: Reminder["repeat"];
  channels?: ("app" | "email")[];
  taskId?: string;
  projectId?: string;
}): Promise<Reminder> {
  const user = await requireCapabilityUser();
  const reminder = await reminderService.createReminder(user, input);
  revalidateMiEspacio();
  return reminder;
}

/** `dueAt = until`, `firedAt = null`. Errors: `NOT_FOUND`, `FORBIDDEN`, `PAST_TIME`. */
export async function snoozeReminderAction(id: string, until: string): Promise<Reminder> {
  const user = await requireCapabilityUser();
  const reminder = await reminderService.snoozeReminder(user, id, until);
  revalidateMiEspacio();
  return reminder;
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function cancelReminderAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  await reminderService.cancelReminder(user, id);
  revalidateMiEspacio();
}
