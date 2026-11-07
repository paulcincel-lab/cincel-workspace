"use server";

import { notImplementedAction, stubDefault } from "@/lib/stubs";
import type { Checklist, ChecklistItem, Note, ParsedReminder, Reminder } from "@/lib/types/redesign";

/**
 * Mi espacio: notes, checklists and reminders (redesign BE §7.5). Owner-only;
 * repositories are `ownerScoped` instances. A row of someone else →
 * `FORBIDDEN`, a missing row → `NOT_FOUND`; linked `projectId` / `taskId` must
 * be visible to the caller. Writes revalidate `/mi-espacio`.
 */

// ── Notes ───────────────────────────────────────────────────────────────────

/** Live notes, pinned first, then `updatedAt desc`. */
export async function fetchNotesAction(): Promise<Note[]> {
  return stubDefault<Note[]>([]);
}

/** Errors: `INVALID` (both empty; body > 20 000; project not visible), `FORBIDDEN`. */
export async function createNoteAction(input: {
  title?: string;
  body?: string;
  color?: Note["color"];
  pinned?: boolean;
  projectId?: string | null;
}): Promise<Note> {
  return notImplementedAction("createNoteAction", input);
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID`. */
export async function updateNoteAction(id: string, patch: Partial<Omit<Note, "id" | "updatedAt">>): Promise<Note> {
  return notImplementedAction("updateNoteAction", id, patch);
}

/** Soft delete. Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function archiveNoteAction(id: string): Promise<void> {
  return notImplementedAction("archiveNoteAction", id);
}

/** Undo of `archiveNoteAction` (clears `deleted_at`). Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function restoreNoteAction(id: string): Promise<Note> {
  return notImplementedAction("restoreNoteAction", id);
}

// ── Checklists ──────────────────────────────────────────────────────────────

/** Live checklists, items by `sortOrder`. */
export async function fetchChecklistsAction(): Promise<Checklist[]> {
  return stubDefault<Checklist[]>([]);
}

/** Errors: `INVALID`, `FORBIDDEN`. */
export async function createChecklistAction(input: {
  title: string;
  items?: string[];
  projectId?: string;
}): Promise<Checklist> {
  return notImplementedAction("createChecklistAction", input);
}

/** Appends an item. Errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID`. */
export async function addChecklistItemAction(checklistId: string, text: string): Promise<ChecklistItem> {
  return notImplementedAction("addChecklistItemAction", checklistId, text);
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function toggleChecklistItemAction(itemId: string, done: boolean): Promise<ChecklistItem> {
  return notImplementedAction("toggleChecklistItemAction", itemId, done);
}

/** `ids` = exactly the checklist's item ids. Errors: `NOT_FOUND`, `FORBIDDEN`, `INVALID`. */
export async function reorderChecklistItemsAction(checklistId: string, ids: string[]): Promise<void> {
  return notImplementedAction("reorderChecklistItemsAction", checklistId, ids);
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function archiveChecklistAction(id: string): Promise<void> {
  return notImplementedAction("archiveChecklistAction", id);
}

// ── Reminders ───────────────────────────────────────────────────────────────

/** Open reminders by `dueAt` (default now − 1 day … now + 30 days). Errors: `INVALID`. */
export async function fetchRemindersAction(input: { from?: string; to?: string }): Promise<Reminder[]> {
  return stubDefault<Reminder[]>([], input);
}

/** Natural-language parse (BE §8.4), ≤ 280 chars. Errors: `INVALID`. Auth: staff. */
export async function parseReminderTextAction(text: string): Promise<ParsedReminder> {
  return stubDefault<ParsedReminder>({ cleanText: text, dueAt: null, repeat: "none" });
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
  return notImplementedAction("createReminderAction", input);
}

/** `dueAt = until`, `firedAt = null`. Errors: `NOT_FOUND`, `FORBIDDEN`, `PAST_TIME`. */
export async function snoozeReminderAction(id: string, until: string): Promise<Reminder> {
  return notImplementedAction("snoozeReminderAction", id, until);
}

/** Errors: `NOT_FOUND`, `FORBIDDEN`. */
export async function cancelReminderAction(id: string): Promise<void> {
  return notImplementedAction("cancelReminderAction", id);
}
