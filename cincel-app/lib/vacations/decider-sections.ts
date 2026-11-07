import "server-only";

import { fetchPendingVacationRequestsAction, fetchVacationSettingsAction } from "@/lib/actions/vacations-actions";
import { IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import { requireCapabilityUser } from "@/lib/auth/session";
import { actionErrorCode } from "@/lib/errors";
import type { PendingVacationRequest, VacationSettingsView } from "@/lib/types/redesign";

export type VacationDeciderData = {
  viewerStaffId: string;
  /** Pending requests of other people, oldest first; the viewer's own rows are dropped here. */
  requests: PendingVacationRequest[];
  /** null while the settings read is not available. */
  settings: VacationSettingsView | null;
};

/**
 * Server loader of the deciders' part of Mis vacaciones (redesign FE §3.7):
 * "Solicitudes del equipo" and "Días de vacaciones". Returns null when the
 * viewer may not decide vacations (`canDecideVacations`, enforced by the
 * actions with `FORBIDDEN`) or while the pending-requests read is not
 * implemented, so the page renders nothing for them. Other errors reach the
 * error boundary.
 */
export async function loadVacationDeciderData(): Promise<VacationDeciderData | null> {
  if (!IMPLEMENTED.fetchPendingVacationRequestsAction) return null;
  const user = await requireCapabilityUser();
  const viewerStaffId = user.member.id;

  let requests: PendingVacationRequest[];
  try {
    requests = await fetchPendingVacationRequestsAction();
  } catch (err) {
    if (actionErrorCode(err) === "FORBIDDEN") return null;
    throw err;
  }

  let settings: VacationSettingsView | null = null;
  if (IMPLEMENTED.fetchVacationSettingsAction) {
    try {
      settings = await fetchVacationSettingsAction();
    } catch (err) {
      if (actionErrorCode(err) !== "FORBIDDEN") throw err;
    }
  }

  return {
    viewerStaffId,
    requests: requests.filter((request) => request.staffId !== viewerStaffId),
    settings,
  };
}
