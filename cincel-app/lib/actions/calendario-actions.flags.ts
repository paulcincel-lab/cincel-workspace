/** Which actions of `calendario-actions.ts` and `page-data/calendario-actions.ts` are implemented (Rule 3). Client-safe. Each owning issue flips its entries. */
export const IMPLEMENTED = {
  // Reads (page-data)
  getCalendarioRange: true,
  getCalendarioList: true,
  getCalendarioDaySummary: false,
  getCalendarioWeekSummary: false,
  getCalendarioLoad: false,
  getMeetingDetail: true,
  getMeetingPrep: false,
  getMeetingMinutes: false,
  getPlanWeek: false,
  getProposal: false,
  // Writes
  createMeetingAction: true,
  updateMeetingAction: true,
  cancelMeetingAction: true,
  retryMeetingSyncAction: true,
  refreshGoogleEventsAction: true,
  saveMeetingNotesAction: false,
  proposeFromTextAction: false,
  runProposingToolAction: false,
  applyProposalAction: false,
  cancelProposalAction: false,
  undoProposalAction: false,
  sendAgendaAction: false,
  sendMinutesAction: false,
  setTaskEstimatedHoursAction: false,
} as const;
