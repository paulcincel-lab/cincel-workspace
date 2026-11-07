/** Which actions of `my-space-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchNotesAction: true,
  createNoteAction: true,
  updateNoteAction: true,
  archiveNoteAction: true,
  restoreNoteAction: true,
  fetchChecklistsAction: true,
  createChecklistAction: true,
  addChecklistItemAction: true,
  toggleChecklistItemAction: true,
  reorderChecklistItemsAction: true,
  archiveChecklistAction: true,
  fetchRemindersAction: true,
  parseReminderTextAction: true,
  createReminderAction: true,
  snoozeReminderAction: true,
  cancelReminderAction: true,
} as const;
