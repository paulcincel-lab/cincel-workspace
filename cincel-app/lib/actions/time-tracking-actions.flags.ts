/** Which actions of `time-tracking-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchTimeTrackingSettingsAction: true,
  saveTimeTrackingSettingsAction: true,
  fetchMyTodayAction: true,
  clockInAction: true,
  pauseWorkAction: true,
  resumeWorkAction: true,
  clockOutAction: true,
  fetchTeamHoursAction: true,
  fetchMyWeekHoursAction: true,
} as const;
