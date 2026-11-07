/** Which actions of `vacations-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchMyVacationsAction: false,
  requestVacationAction: false,
  cancelVacationRequestAction: false,
  fetchPendingVacationRequestsAction: false,
  decideVacationAction: false,
  fetchTeamAbsencesAction: false,
  fetchVacationSettingsAction: false,
  saveVacationSettingsAction: false,
} as const;
