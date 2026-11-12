/** Which actions of `calendario-actions.ts` and `page-data/calendario-actions.ts` are implemented (Rule 3). Client-safe. Each owning issue flips its entries. */
export const IMPLEMENTED = {
  // Reads (page-data)
  getCalendarioRange: true,
  getCalendarioList: true,
  getCalendarioDaySummary: true,
  getCalendarioWeekSummary: true,
  getCalendarioLoad: true,
  getMeetingDetail: true,
  getMeetingPrep: true,
  getMeetingMinutes: true,
  getPlanWeek: true,
  getProposal: true,
  // Writes
  createMeetingAction: true,
  updateMeetingAction: true,
  cancelMeetingAction: true,
  retryMeetingSyncAction: true,
  refreshGoogleEventsAction: true,
  saveMeetingNotesAction: true,
  proposeFromTextAction: true,
  runProposingToolAction: true,
  applyProposalAction: true,
  cancelProposalAction: true,
  undoProposalAction: true,
  sendAgendaAction: true,
  sendMinutesAction: true,
  setTaskEstimatedHoursAction: true,
} as const;
