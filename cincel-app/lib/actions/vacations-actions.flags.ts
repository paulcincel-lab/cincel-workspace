/** Which actions of `vacations-actions.ts` are implemented (redesign BE §9.10). Client-safe. */
export const IMPLEMENTED = {
  fetchMyVacationsAction: true,
  requestVacationAction: true,
  cancelVacationRequestAction: true,
  fetchPendingVacationRequestsAction: true,
  decideVacationAction: true,
  fetchTeamAbsencesAction: true,
  fetchVacationSettingsAction: true,
  saveVacationSettingsAction: true,
} as const;
