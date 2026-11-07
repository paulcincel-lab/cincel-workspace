/**
 * Mi espacio tables (redesign BE §3.6, §7.5): thin `ownerScoped` instances;
 * checklist items go through their parent checklist.
 */
import { checklists, notes, reminders } from "@/lib/db/schema";
import { ownerScoped } from "@/lib/repositories/owner-scoped";

export type NoteRow = typeof notes.$inferSelect;
export type ChecklistRow = typeof checklists.$inferSelect;
export type ReminderRow = typeof reminders.$inferSelect;

export const notesRepository = ownerScoped(notes);
export const checklistsRepository = ownerScoped(checklists);
export const remindersRepository = ownerScoped(reminders);
