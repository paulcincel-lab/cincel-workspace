/** Which actions of `my-space-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchNotesAction: false,
  createNoteAction: false,
  updateNoteAction: false,
  archiveNoteAction: false,
  restoreNoteAction: false,
  fetchChecklistsAction: false,
  createChecklistAction: false,
  addChecklistItemAction: false,
  toggleChecklistItemAction: false,
  reorderChecklistItemsAction: false,
  archiveChecklistAction: false,
  fetchRemindersAction: false,
  parseReminderTextAction: false,
  createReminderAction: false,
  snoozeReminderAction: false,
  cancelReminderAction: false,
} as const;
