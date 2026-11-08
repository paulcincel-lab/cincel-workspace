import "server-only";

import { IMPLEMENTED } from "@/lib/actions/vacations-actions.flags";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canDecideVacations } from "@/lib/auth/permissions";
import type { PendingVacationRequest, VacationSettingsView } from "@/lib/types/redesign";
import { readPendingVacationRequests, readVacationSettings } from "@/lib/vacations/reads";

export type VacationDeciderData = {
  viewerStaffId: string;
  /** Pending requests of other people, oldest first; the viewer's own rows are dropped here. */
  requests: PendingVacationRequest[];
  /** null while the settings read is not available. */
  settings: VacationSettingsView | null;
};

/**
 * The deciders' part of Mis vacaciones (redesign FE §3.7): "Solicitudes del
 * equipo" and "Días de vacaciones", read for `user` in one parallel wave.
 * Null when the viewer may not decide vacations (`canDecideVacations`) or
 * while the pending-requests read is not implemented: no pending requests of
 * others and no settings ever reach a non-decider's page. Other errors reach
 * the error boundary.
 */
export async function loadVacationDeciderData(user: AuthenticatedUser): Promise<VacationDeciderData | null> {
  if (!IMPLEMENTED.fetchPendingVacationRequestsAction || !canDecideVacations(user)) return null;
  const viewerStaffId = user.member.id;
  const [requests, settings] = await Promise.all([
    readPendingVacationRequests(user),
    IMPLEMENTED.fetchVacationSettingsAction ? readVacationSettings(user) : Promise.resolve(null),
  ]);
  return {
    viewerStaffId,
    requests: requests.filter((request) => request.staffId !== viewerStaffId),
    settings,
  };
}
