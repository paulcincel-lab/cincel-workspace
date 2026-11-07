/** Which actions of `assistant-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchAssistantThreadsAction: false,
  fetchAssistantThreadAction: false,
  deleteAssistantThreadAction: false,
  importLegacyAssistantThreadAction: false,
  fetchAssistantActionsAction: false,
} as const;
