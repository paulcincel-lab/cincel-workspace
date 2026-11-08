"use server";

import { after } from "next/server";
import { z } from "zod";

import { toActionResult } from "@/lib/actions/action-result";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { getAppOrigin } from "@/lib/auth/safe-return-to";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sendMail } from "@/lib/email";
import { vacacionesDecisionEmail, vacacionesSolicitudEmail } from "@/lib/email/templates";
import { notify } from "@/lib/notifications/notify";
import * as vacationsRepository from "@/lib/repositories/vacations-repository";
import type { VacationRequestRow } from "@/lib/repositories/vacations-repository";
import { getTimeTrackingSettings } from "@/lib/time-tracking/settings";
import type { ActionResult } from "@/lib/types/schedule";
import type {
  PendingVacationRequest,
  TeamAbsence,
  VacationKind,
  VacationRequest,
  VacationSettingsView,
} from "@/lib/types/redesign";
import { calendarDaysInRange, MAX_REQUEST_CALENDAR_DAYS, workDaysInRange } from "@/lib/vacations/balance";
import {
  assertVacationDecider,
  loadVacationSettingsView,
  readMyVacations,
  readPendingVacationRequests,
  readTeamAbsences,
  readVacationSettings,
  toVacationDto,
  vacationsToday,
  type MyVacations,
} from "@/lib/vacations/reads";
import {
  TeamAbsencesInputSchema,
  UuidSchema,
  VacationDecisionSchema,
  VacationRequestInputSchema,
  VacationSettingsInputSchema,
  parseInput,
} from "@/lib/validation/redesign";

/**
 * Vacations (redesign BE §7.8, §8.8). The absence `kind` is returned only to
 * the requester and to `canDecideVacations`; everyone else gets "ausencia".
 * The reads live in `lib/vacations/reads.ts`. The writes return
 * `ActionResult` (production strips thrown messages) and revalidate no
 * path: the client updates its query cache (Query Migration Phase 8).
 */

const VACATIONS_PATH = "/biblioteca/vacaciones";
const DecisionNoteSchema = z.string().trim().max(1000).optional();

async function requireDecider(): Promise<AuthenticatedUser> {
  const user = await requireCapabilityUser();
  assertVacationDecider(user);
  return user;
}

function daysLabel(days: number): string {
  return days === 1 ? "1 día" : `${days} días`;
}

function logFailure(msg: string, error: unknown, extra: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({ msg, ...extra, error: error instanceof Error ? error.message : String(error) }),
  );
}

/** In-app row + "vacaciones-solicitud" email to every decider but the requester; never the kind (BE §8.8). */
async function notifyDecidersOfRequest(requester: AuthenticatedUser, row: VacationRequestRow): Promise<void> {
  const deciders = (await vacationsRepository.listDeciders(db)).filter((d) => d.id !== row.staffId);
  if (deciders.length === 0) return;
  const requesterName = requester.member.name;
  const title = `Nueva solicitud de ausencia de ${requesterName}`;
  try {
    await notify(
      db,
      deciders.map((d) => d.id),
      {
        kind: "sistema",
        title,
        body: `${row.fromDate} – ${row.toDate} · ${daysLabel(row.days)}`,
        url: VACATIONS_PATH,
        dedupeKey: `vacaciones-solicitud:${row.id}`,
        actorId: row.staffId,
        // The templated email below is the email channel of this notification.
        force: { email: false },
      },
    );
  } catch (error) {
    logFailure("notify.failed", error, { kind: "sistema", count: deciders.length });
  }

  const origin = getAppOrigin();
  if (!origin) {
    console.error("[vacations] APP_ORIGIN is not set; the request email was not sent");
    return;
  }
  const mail = vacacionesSolicitudEmail({
    requesterName,
    from: row.fromDate,
    to: row.toDate,
    days: row.days,
    url: `${origin}${VACATIONS_PATH}`,
  });
  for (const decider of deciders) {
    if (!decider.email) continue;
    try {
      await sendMail({ to: decider.email, ...mail });
    } catch (error) {
      logFailure("vacations.mail_failed", error, { template: "vacaciones-solicitud" });
    }
  }
}

/** In-app row + "vacaciones-decision" email to the requester. */
async function notifyRequesterOfDecision(decider: AuthenticatedUser, row: VacationRequestRow): Promise<void> {
  const decision = row.status === "aprobada" ? "aprobada" : "rechazada";
  try {
    await notify(db, [row.staffId], {
      kind: "sistema",
      title: `Tu solicitud de vacaciones fue ${decision}`,
      body: `${row.fromDate} – ${row.toDate} · ${daysLabel(row.days)}${row.decisionNote ? ` · ${row.decisionNote}` : ""}`,
      url: VACATIONS_PATH,
      dedupeKey: `vacaciones-decision:${row.id}`,
      actorId: decider.member.id,
      force: { inApp: true, email: false },
    });
  } catch (error) {
    logFailure("notify.failed", error, { kind: "sistema", count: 1 });
  }

  const requester = await vacationsRepository.getStaffForVacations(db, row.staffId);
  if (!requester?.email) return;
  try {
    const mail = vacacionesDecisionEmail({
      decision,
      from: row.fromDate,
      to: row.toDate,
      days: row.days,
      approverName: decider.member.name,
      note: row.decisionNote ?? null,
    });
    await sendMail({ to: requester.email, ...mail });
  } catch (error) {
    logFailure("vacations.mail_failed", error, { template: "vacaciones-decision" });
  }
}

/** The caller's balance and requests of the current year. Auth: owner. */
export async function fetchMyVacationsAction(): Promise<MyVacations> {
  return readMyVacations(await requireCapabilityUser());
}

/** Notifies deciders (`sistema`). Errors: `INVALID` (to < from; > 30 days; 0 work days), `OVERLAP`. */
export async function requestVacationAction(
  ...args: Parameters<typeof requestVacationActionImpl>
): Promise<ActionResult<VacationRequest>> {
  return toActionResult(() => requestVacationActionImpl(...args));
}

async function requestVacationActionImpl(input: {
  from: string;
  to: string;
  kind: VacationKind;
  comment?: string;
}): Promise<VacationRequest> {
  const user = await requireCapabilityUser();
  const parsed = parseInput(VacationRequestInputSchema, input);
  if (calendarDaysInRange(parsed.from, parsed.to) > MAX_REQUEST_CALENDAR_DAYS) throw new Error("INVALID: to");
  const settings = await getTimeTrackingSettings();
  const days = workDaysInRange(parsed.from, parsed.to, settings.workDays);
  if (days === 0) throw new Error("INVALID: days");
  const staffId = user.member.id;

  const row = await db.transaction(async (tx) => {
    await vacationsRepository.lockStaffVacations(tx, staffId);
    const overlaps = await vacationsRepository.findOwnOverlaps(tx, staffId, { from: parsed.from, to: parsed.to });
    if (overlaps.length > 0) throw new Error("OVERLAP");
    return vacationsRepository.insertVacationRequest(tx, {
      staffId,
      fromDate: parsed.from,
      toDate: parsed.to,
      kind: parsed.kind,
      comment: parsed.comment?.trim() ?? "",
      days,
    });
  });

  after(() => notifyDecidersOfRequest(user, row));
  return toVacationDto(row);
}

/** → cancelada (pendiente, or aprobada starting in the future). Errors: `NOT_FOUND`, `FORBIDDEN`, `STARTED`. */
export async function cancelVacationRequestAction(
  ...args: Parameters<typeof cancelVacationRequestActionImpl>
): Promise<ActionResult<void>> {
  return toActionResult(() => cancelVacationRequestActionImpl(...args));
}

async function cancelVacationRequestActionImpl(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  const requestId = parseInput(UuidSchema, id);
  const now = vacationsToday();

  await db.transaction(async (tx) => {
    const row = await vacationsRepository.lockVacationRequest(tx, requestId);
    if (!row) throw new Error("NOT_FOUND");
    if (row.staffId !== user.member.id) throw new Error("FORBIDDEN");
    if (row.status === "aprobada") {
      if (row.fromDate <= now) throw new Error("STARTED");
    } else if (row.status !== "pendiente") {
      throw new Error("INVALID: status");
    }
    await vacationsRepository.updateVacationRequest(tx, row.id, { status: "cancelada" });
  });
}

/** Pending requests, oldest first ("Solicitudes del equipo"). Auth: `canDecideVacations`. Errors: `FORBIDDEN`. */
export async function fetchPendingVacationRequestsAction(): Promise<PendingVacationRequest[]> {
  return readPendingVacationRequests(await requireCapabilityUser());
}

/**
 * Approve or reject; notifies the requester (in-app + email). Auth:
 * `canDecideVacations`, never the requester. Errors: `FORBIDDEN`, `NOT_FOUND`,
 * `INVALID` (not pendiente).
 */
export async function decideVacationAction(
  ...args: Parameters<typeof decideVacationActionImpl>
): Promise<ActionResult<VacationRequest>> {
  return toActionResult(() => decideVacationActionImpl(...args));
}

async function decideVacationActionImpl(
  id: string,
  decision: "aprobada" | "rechazada",
  note?: string,
): Promise<VacationRequest> {
  const user = await requireDecider();
  const requestId = parseInput(UuidSchema, id);
  const status = parseInput(VacationDecisionSchema, decision);
  const cleanNote = parseInput(DecisionNoteSchema, note);

  const row = await db.transaction(async (tx) => {
    const current = await vacationsRepository.lockVacationRequest(tx, requestId);
    if (!current) throw new Error("NOT_FOUND");
    if (current.staffId === user.member.id) throw new Error("FORBIDDEN");
    if (current.status !== "pendiente") throw new Error("INVALID: status");
    return vacationsRepository.updateVacationRequest(tx, current.id, {
      status,
      decidedBy: user.member.id,
      decidedAt: new Date(),
      decisionNote: cleanNote ? cleanNote : null,
    });
  });

  after(() => notifyRequesterOfDecision(user, row));
  return toVacationDto(row);
}

/** Approved absences of the month (pending too for deciders). Auth: staff. Errors: `INVALID`. */
export async function fetchTeamAbsencesAction(input: { month: string }): Promise<TeamAbsence[]> {
  const user = await requireCapabilityUser();
  const { month } = parseInput(TeamAbsencesInputSchema, input);
  return readTeamAbsences(user, month);
}

/** Org default and per-person overrides (active staff). Auth: `canDecideVacations`. Errors: `FORBIDDEN`. */
export async function fetchVacationSettingsAction(): Promise<VacationSettingsView> {
  return readVacationSettings(await requireCapabilityUser());
}

/** Auth: `canDecideVacations`. Errors: `FORBIDDEN`, `INVALID`. */
export async function saveVacationSettingsAction(
  ...args: Parameters<typeof saveVacationSettingsActionImpl>
): Promise<ActionResult<VacationSettingsView>> {
  return toActionResult(() => saveVacationSettingsActionImpl(...args));
}

async function saveVacationSettingsActionImpl(input: {
  daysPerYear: number;
  overrides: { staffId: string; days: number | null }[];
}): Promise<VacationSettingsView> {
  await requireDecider();
  const parsed = parseInput(VacationSettingsInputSchema, input);
  const ids = [...new Set(parsed.overrides.map((o) => o.staffId))];
  const known = await vacationsRepository.existingStaffIds(db, ids);
  if (ids.some((staffId) => !known.has(staffId))) throw new Error("INVALID: overrides");

  await db.transaction((tx) => vacationsRepository.saveVacationSettings(tx, parsed));

  return loadVacationSettingsView();
}
