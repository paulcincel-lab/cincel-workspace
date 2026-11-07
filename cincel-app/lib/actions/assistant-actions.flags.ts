/** Which actions of `assistant-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchAssistantThreadsAction: true,
  fetchAssistantThreadAction: true,
  deleteAssistantThreadAction: true,
  importLegacyAssistantThreadAction: true,
  fetchAssistantActionsAction: true,
} as const;
