import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canDecideVacations } from "@/lib/auth/permissions";
import { localIsoDate } from "@/lib/dashboard/task-trend";
import { db } from "@/lib/db/client";
import * as vacationsRepository from "@/lib/repositories/vacations-repository";
import type { VacationRequestRow } from "@/lib/repositories/vacations-repository";
import { getTimeTrackingSettings, TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import type {
  PendingVacationRequest,
  TeamAbsence,
  VacationBalance,
  VacationRequest,
  VacationSettingsView,
} from "@/lib/types/redesign";
import { entitledDays, monthRange, vacationBalance } from "@/lib/vacations/balance";

/**
 * The vacation reads (redesign BE §7.8) as `(user, input) => data`: the
 * actions in `lib/actions/vacations-actions.ts` call them after the session
 * check and the Mis vacaciones loader (`lib/loaders/biblioteca.ts`) calls
 * them directly with the page's viewer. Read-only: no writes, no
 * revalidation. The absence `kind` is returned only to the requester and to
 * `canDecideVacations`; everyone else gets "ausencia".
 */

export type MyVacations = { balance: VacationBalance; requests: VacationRequest[] };

export function toVacationDto(row: VacationRequestRow): VacationRequest {
  return {
    id: row.id,
    from: row.fromDate,
    to: row.toDate,
    kind: row.kind,
    comment: row.comment,
    status: row.status,
  };
}

/** Today (YYYY-MM-DD) in the organization's time zone. */
export function vacationsToday(): string {
  return localIsoDate(new Date(), TIME_TRACKING_TIME_ZONE);
}

/** `FORBIDDEN` unless the viewer may decide vacations. */
export function assertVacationDecider(user: AuthenticatedUser): void {
  if (!canDecideVacations(user)) throw new Error("FORBIDDEN");
}

/** The viewer's balance and requests of the current year, newest first. */
export async function readMyVacations(user: AuthenticatedUser): Promise<MyVacations> {
  const staffId = user.member.id;
  const now = vacationsToday();
  const year = now.slice(0, 4);
  const [rows, settings, me, daysPerYear] = await Promise.all([
    vacationsRepository.listVacationRequests(db, { from: `${year}-01-01`, to: `${year}-12-31`, staffIds: [staffId] }),
    getTimeTrackingSettings(),
    vacationsRepository.getStaffForVacations(db, staffId),
    vacationsRepository.getOrgDaysPerYear(db),
  ]);
  const balance = vacationBalance({
    entitled: entitledDays(me?.vacationDays, daysPerYear),
    requests: rows.map((r) => ({ from: r.fromDate, to: r.toDate, status: r.status, days: r.days })),
    today: now,
    workDays: settings.workDays,
  });
  const requests = [...rows]
    .sort((a, b) => (a.fromDate === b.fromDate ? 0 : a.fromDate < b.fromDate ? 1 : -1))
    .map(toVacationDto);
  return { balance, requests };
}

/** Approved absences of `month` ("YYYY-MM", already validated); pending ones too for deciders. */
export async function readTeamAbsences(user: AuthenticatedUser, month: string): Promise<TeamAbsence[]> {
  const decider = canDecideVacations(user);
  const rows = await vacationsRepository.listTeamRequests(
    db,
    monthRange(month),
    decider ? ["aprobada", "pendiente"] : ["aprobada"],
  );
  return rows.map((r) => ({
    staffId: r.staffId,
    name: r.name,
    from: r.fromDate,
    to: r.toDate,
    kind: decider || r.staffId === user.member.id ? r.kind : "ausencia",
  }));
}

/** Pending requests of other people, oldest first. `FORBIDDEN` for a non-decider. */
export async function readPendingVacationRequests(user: AuthenticatedUser): Promise<PendingVacationRequest[]> {
  assertVacationDecider(user);
  // A decider never decides their own request, so it is not listed here.
  const rows = await vacationsRepository.listPendingRequests(db, { excludeStaffId: user.member.id });
  return rows.map((r) => ({ ...toVacationDto(r), staffId: r.staffId, name: r.name, days: r.days }));
}

/** Org default and per-person overrides (active staff). `FORBIDDEN` for a non-decider. */
export async function readVacationSettings(user: AuthenticatedUser): Promise<VacationSettingsView> {
  assertVacationDecider(user);
  return loadVacationSettingsView();
}

/** The settings view without the capability check (after a save that already checked it). */
export async function loadVacationSettingsView(): Promise<VacationSettingsView> {
  const [daysPerYear, overrides] = await Promise.all([
    vacationsRepository.getOrgDaysPerYear(db),
    vacationsRepository.listVacationOverrides(db),
  ]);
  return { daysPerYear, overrides };
}
