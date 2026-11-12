/** Which actions of `calendario-actions.ts` and `page-data/calendario-actions.ts` are implemented (Rule 3). Client-safe. Each owning issue flips its entries. */
export const IMPLEMENTED = {
  // Reads (page-data)
  getCalendarioRange: false,
  getCalendarioList: false,
  getCalendarioDaySummary: true,
  getCalendarioWeekSummary: true,
  getCalendarioLoad: false,
  getMeetingDetail: false,
  getMeetingPrep: false,
  getMeetingMinutes: false,
  getPlanWeek: false,
  getProposal: true,
  // Writes
  createMeetingAction: false,
  updateMeetingAction: false,
  cancelMeetingAction: false,
  retryMeetingSyncAction: false,
  refreshGoogleEventsAction: false,
  saveMeetingNotesAction: false,
  proposeFromTextAction: true,
  runProposingToolAction: true,
  applyProposalAction: true,
  cancelProposalAction: true,
  undoProposalAction: true,
  sendAgendaAction: false,
  sendMinutesAction: false,
  setTaskEstimatedHoursAction: false,
} as const;
