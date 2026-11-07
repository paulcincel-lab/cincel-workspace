/**
 * Mi espacio notes and checklists (redesign BE §7.5, §8.0.3, §9.1). Owner-only:
 * every read and write goes through the `ownerScoped` repositories with the
 * session's staff id, so another person's row is `FORBIDDEN` and a missing
 * (or archived) one `NOT_FOUND`; there is no admin bypass. A linked
 * `projectId` must be a live project the caller can see, otherwise `INVALID`.
 * The actions in `lib/actions/my-space-actions.ts` call these with the
 * session user and revalidate `/mi-espacio`.
 */
import "server-only";

import { asc, desc, isNull } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { checklists, notes } from "@/lib/db/schema";
import { checklistsRepository, notesRepository } from "@/lib/repositories/my-space-repository";
import type { ChecklistRow, NoteRow } from "@/lib/repositories/my-space-repository";
import * as itemsRepository from "@/lib/repositories/notes-checklists-repository";
import type { ChecklistItemRow } from "@/lib/repositories/notes-checklists-repository";
import { projectExists } from "@/lib/repositories/projects-repository";
import type { Checklist, ChecklistItem, Note } from "@/lib/types/redesign";
import {
  ChecklistInputSchema,
  ChecklistItemTextSchema,
  NoteInputSchema,
  NotePatchSchema,
  OrderedIdsSchema,
  parseInput,
} from "@/lib/validation/redesign";
import { UuidSchema } from "@/lib/validation/project-flow";

// ── DTOs ────────────────────────────────────────────────────────────────────

export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    color: row.color,
    pinned: row.pinned,
    projectId: row.projectId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toChecklistItem(row: ChecklistItemRow): ChecklistItem {
  return { id: row.id, text: row.text, done: row.done, sortOrder: row.sortOrder };
}

function toChecklist(row: ChecklistRow, items: ChecklistItemRow[]): Checklist {
  return { id: row.id, title: row.title, projectId: row.projectId, items: items.map(toChecklistItem) };
}

// ── Guards ──────────────────────────────────────────────────────────────────

/** A malformed id can't name a row: `NOT_FOUND` (never a database error). */
function rowId(id: unknown): string {
  const parsed = UuidSchema.safeParse(id);
  if (!parsed.success) throw new Error("NOT_FOUND");
  return parsed.data;
}

/** `INVALID` unless the project is live and the caller can see projects. */
async function assertProjectVisible(user: AuthenticatedUser, projectId: string): Promise<void> {
  if (!resolveProjectsCapabilities(user).canViewProjects) throw new Error("INVALID: projectId");
  if (!(await projectExists(projectId))) throw new Error("INVALID: projectId");
}

/** The caller's live note; `NOT_FOUND` / `FORBIDDEN` from the owner-scoped helper, archived → `NOT_FOUND`. */
async function liveNote(staffId: string, id: string): Promise<NoteRow> {
  const row = await notesRepository.get(db, staffId, id);
  if (row.deletedAt) throw new Error("NOT_FOUND");
  return row;
}

/** The caller's live checklist (same rules as `liveNote`). */
async function liveChecklist(staffId: string, id: string): Promise<ChecklistRow> {
  const row = await checklistsRepository.get(db, staffId, id);
  if (row.deletedAt) throw new Error("NOT_FOUND");
  return row;
}

// ── Notes ───────────────────────────────────────────────────────────────────

/** Live notes, pinned first, then `updatedAt desc`. */
export async function listNotes(user: AuthenticatedUser): Promise<Note[]> {
  const rows = await notesRepository.list(db, user.member.id, {
    where: isNull(notes.deletedAt),
    orderBy: [desc(notes.pinned), desc(notes.updatedAt), desc(notes.createdAt)],
  });
  return rows.filter((row) => !row.deletedAt).map(toNote);
}

export async function createNote(user: AuthenticatedUser, input: unknown): Promise<Note> {
  const data = parseInput(NoteInputSchema, input);
  if (data.projectId) await assertProjectVisible(user, data.projectId);
  const row = await notesRepository.insert(db, user.member.id, {
    title: data.title ?? "",
    body: data.body ?? "",
    color: data.color ?? "neutral",
    pinned: data.pinned ?? false,
    projectId: data.projectId ?? null,
  });
  return toNote(row);
}

export async function updateNote(user: AuthenticatedUser, id: unknown, patch: unknown): Promise<Note> {
  const noteId = rowId(id);
  const data = parseInput(NotePatchSchema, patch ?? {});
  const current = await liveNote(user.member.id, noteId);
  const title = data.title ?? current.title;
  const body = data.body ?? current.body;
  if (title.trim().length === 0 && body.trim().length === 0) throw new Error("INVALID: body");
  if (data.projectId && data.projectId !== current.projectId) await assertProjectVisible(user, data.projectId);
  if (Object.keys(data).length === 0) return toNote(current);
  const row = await notesRepository.update(db, user.member.id, noteId, data);
  return toNote(row);
}

/** Soft delete (undo with `restoreNote`). */
export async function archiveNote(user: AuthenticatedUser, id: unknown): Promise<void> {
  const noteId = rowId(id);
  await liveNote(user.member.id, noteId);
  await notesRepository.softDelete(db, user.member.id, noteId);
}

/** Clears `deleted_at`; a live note comes back unchanged. */
export async function restoreNote(user: AuthenticatedUser, id: unknown): Promise<Note> {
  const noteId = rowId(id);
  const state = await itemsRepository.findNoteState(db, noteId);
  if (!state) throw new Error("NOT_FOUND");
  if (state.staffId !== user.member.id) throw new Error("FORBIDDEN");
  if (!state.deletedAt) return toNote(await notesRepository.get(db, user.member.id, noteId));
  return toNote(await itemsRepository.restoreNote(db, user.member.id, noteId));
}

// ── Checklists ──────────────────────────────────────────────────────────────

/** Live checklists, newest first, items by `sortOrder`. */
export async function listChecklists(user: AuthenticatedUser): Promise<Checklist[]> {
  const rows = await checklistsRepository.list(db, user.member.id, {
    where: isNull(checklists.deletedAt),
    orderBy: [desc(checklists.createdAt), asc(checklists.title)],
  });
  const live = rows.filter((row) => !row.deletedAt);
  const items = await itemsRepository.listChecklistItems(
    db,
    live.map((row) => row.id),
  );
  const byChecklist = new Map<string, ChecklistItemRow[]>();
  for (const item of items) {
    const list = byChecklist.get(item.checklistId) ?? [];
    list.push(item);
    byChecklist.set(item.checklistId, list);
  }
  return live.map((row) => toChecklist(row, byChecklist.get(row.id) ?? []));
}

/** Creates the checklist and its optional initial items (in order) in one transaction. */
export async function createChecklist(user: AuthenticatedUser, input: unknown): Promise<Checklist> {
  const data = parseInput(ChecklistInputSchema, input);
  if (data.projectId) await assertProjectVisible(user, data.projectId);
  return db.transaction(async (tx) => {
    const row = await checklistsRepository.insert(tx, user.member.id, {
      title: data.title,
      projectId: data.projectId ?? null,
    });
    const items = await itemsRepository.appendChecklistItems(tx, row.id, data.items ?? []);
    return toChecklist(row, items);
  });
}

/** Appends an item at the end; the checklist row lock serializes concurrent appends. */
export async function addChecklistItem(
  user: AuthenticatedUser,
  checklistId: unknown,
  text: unknown,
): Promise<ChecklistItem> {
  const id = rowId(checklistId);
  const value = parseInput(ChecklistItemTextSchema, text);
  return db.transaction(async (tx) => {
    const checklist = await checklistsRepository.lockForUpdate(tx, user.member.id, id);
    if (checklist.deletedAt) throw new Error("NOT_FOUND");
    const [item] = await itemsRepository.appendChecklistItems(tx, id, [value]);
    return toChecklistItem(item!);
  });
}

export async function toggleChecklistItem(
  user: AuthenticatedUser,
  itemId: unknown,
  done: unknown,
): Promise<ChecklistItem> {
  const id = rowId(itemId);
  if (typeof done !== "boolean") throw new Error("INVALID: done");
  const found = await itemsRepository.findChecklistItemWithOwner(db, id);
  if (!found || found.checklistDeletedAt) throw new Error("NOT_FOUND");
  if (found.staffId !== user.member.id) throw new Error("FORBIDDEN");
  if (found.item.done === done) return toChecklistItem(found.item);
  return toChecklistItem(await itemsRepository.setChecklistItemDone(db, id, done));
}

/**
 * `ids` must be exactly the checklist's item ids (no missing, extra or
 * repeated id), else `INVALID`. Runs under `lockForUpdate` on the checklist,
 * so concurrent reorders (and appends) serialize.
 */
export async function reorderChecklistItems(
  user: AuthenticatedUser,
  checklistId: unknown,
  ids: unknown,
): Promise<void> {
  const id = rowId(checklistId);
  const order = parseInput(OrderedIdsSchema, ids);
  await db.transaction(async (tx) => {
    const checklist = await checklistsRepository.lockForUpdate(tx, user.member.id, id);
    if (checklist.deletedAt) throw new Error("NOT_FOUND");
    const current = await itemsRepository.listChecklistItems(tx, [id]);
    const expected = new Set(current.map((item) => item.id));
    const given = new Set(order);
    const exact =
      given.size === order.length &&
      order.length === expected.size &&
      order.every((itemId) => expected.has(itemId));
    if (!exact) throw new Error("INVALID: ids");
    await itemsRepository.setChecklistItemOrder(tx, id, order);
  });
}

/** Soft delete; its items stay with it. */
export async function archiveChecklist(user: AuthenticatedUser, id: unknown): Promise<void> {
  const checklistId = rowId(id);
  await liveChecklist(user.member.id, checklistId);
  await checklistsRepository.softDelete(db, user.member.id, checklistId);
}
