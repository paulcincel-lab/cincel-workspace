/** Which actions of `calendario-actions.ts` and `page-data/calendario-actions.ts` are implemented (Rule 3). Client-safe. Each owning issue flips its entries. */
export const IMPLEMENTED = {
  // Reads (page-data)
  getCalendarioRange: false,
  getCalendarioList: false,
  getCalendarioDaySummary: false,
  getCalendarioWeekSummary: false,
  getCalendarioLoad: true,
  getMeetingDetail: false,
  getMeetingPrep: true,
  getMeetingMinutes: true,
  getPlanWeek: false,
  getProposal: false,
  // Writes
  createMeetingAction: false,
  updateMeetingAction: false,
  cancelMeetingAction: false,
  retryMeetingSyncAction: false,
  refreshGoogleEventsAction: false,
  saveMeetingNotesAction: true,
  proposeFromTextAction: false,
  runProposingToolAction: false,
  applyProposalAction: false,
  cancelProposalAction: false,
  undoProposalAction: false,
  sendAgendaAction: true,
  sendMinutesAction: true,
  setTaskEstimatedHoursAction: true,
} as const;
