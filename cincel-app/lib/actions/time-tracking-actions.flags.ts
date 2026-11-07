/** Which actions of `time-tracking-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchTimeTrackingSettingsAction: false,
  saveTimeTrackingSettingsAction: false,
  fetchMyTodayAction: false,
  clockInAction: false,
  pauseWorkAction: false,
  resumeWorkAction: false,
  clockOutAction: false,
  fetchTeamHoursAction: false,
  fetchMyWeekHoursAction: false,
} as const;
