/** Which actions of `gmail-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchGmailStatusAction: true,
  fetchGmailThreadsAction: true,
  fetchGmailThreadAction: true,
  syncGmailAction: true,
  linkGmailThreadToProjectAction: true,
  createGmailDraftAction: true,
  sendGmailDraftAction: true,
  createTaskFromGmailThreadAction: true,
  disconnectGmailAction: true,
} as const;
