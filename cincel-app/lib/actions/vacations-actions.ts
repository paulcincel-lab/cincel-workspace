"use server";

import { notImplementedAction, stubDefault } from "@/lib/stubs";
import type {
  PendingVacationRequest,
  TeamAbsence,
  VacationBalance,
  VacationKind,
  VacationRequest,
  VacationSettingsView,
} from "@/lib/types/redesign";
import { DEFAULT_VACATION_DAYS_PER_YEAR } from "@/lib/vacations/balance";

/**
 * Vacations (redesign BE §7.8, §8.8). The absence `kind` is returned only to
 * the requester and to `canDecideVacations`; everyone else gets "ausencia".
 * Writes revalidate `/biblioteca/vacaciones`.
 */

/** The caller's balance and requests of the current year. Auth: owner. */
export async function fetchMyVacationsAction(): Promise<{ balance: VacationBalance; requests: VacationRequest[] }> {
  return stubDefault<{ balance: VacationBalance; requests: VacationRequest[] }>({
    balance: { entitled: 0, taken: 0, pending: 0, available: 0 },
    requests: [],
  });
}

/** Notifies deciders (`sistema`). Errors: `INVALID` (to < from; > 30 days; 0 work days), `OVERLAP`. */
export async function requestVacationAction(input: {
  from: string;
  to: string;
  kind: VacationKind;
  comment?: string;
}): Promise<VacationRequest> {
  return notImplementedAction("requestVacationAction", input);
}

/** → cancelada (pendiente, or aprobada starting in the future). Errors: `NOT_FOUND`, `FORBIDDEN`, `STARTED`. */
export async function cancelVacationRequestAction(id: string): Promise<void> {
  return notImplementedAction("cancelVacationRequestAction", id);
}

/** Pending requests, oldest first ("Solicitudes del equipo"). Auth: `canDecideVacations`. Errors: `FORBIDDEN`. */
export async function fetchPendingVacationRequestsAction(): Promise<PendingVacationRequest[]> {
  return stubDefault<PendingVacationRequest[]>([]);
}

/**
 * Approve or reject; notifies the requester (in-app + email). Auth:
 * `canDecideVacations`, never the requester. Errors: `FORBIDDEN`, `NOT_FOUND`,
 * `INVALID` (not pendiente). Also revalidates `/personas`.
 */
export async function decideVacationAction(
  id: string,
  decision: "aprobada" | "rechazada",
  note?: string,
): Promise<VacationRequest> {
  return notImplementedAction("decideVacationAction", id, decision, note);
}

/** Approved absences of the month (pending too for deciders). Auth: staff. Errors: `INVALID`. */
export async function fetchTeamAbsencesAction(input: { month: string }): Promise<TeamAbsence[]> {
  return stubDefault<TeamAbsence[]>([], input);
}

/** Org default and per-person overrides (active staff). Auth: `canDecideVacations`. Errors: `FORBIDDEN`. */
export async function fetchVacationSettingsAction(): Promise<VacationSettingsView> {
  return stubDefault<VacationSettingsView>({ daysPerYear: DEFAULT_VACATION_DAYS_PER_YEAR, overrides: [] });
}

/** Auth: `canDecideVacations`. Errors: `FORBIDDEN`, `INVALID`. */
export async function saveVacationSettingsAction(input: {
  daysPerYear: number;
  overrides: { staffId: string; days: number | null }[];
}): Promise<VacationSettingsView> {
  return notImplementedAction("saveVacationSettingsAction", input);
}
