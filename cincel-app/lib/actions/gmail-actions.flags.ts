/** Which actions of `gmail-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchGmailStatusAction: false,
  fetchGmailThreadsAction: false,
  fetchGmailThreadAction: false,
  syncGmailAction: false,
  linkGmailThreadToProjectAction: false,
  createGmailDraftAction: false,
  sendGmailDraftAction: false,
  createTaskFromGmailThreadAction: false,
  disconnectGmailAction: false,
} as const;
