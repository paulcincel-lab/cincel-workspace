/**
 * Fixtures of Mis vacaciones for component tests, in the shapes of
 * `fetchMyVacationsAction` / `fetchTeamAbsencesAction` (redesign FE §7.9).
 * Far-past and far-future dates keep "started / future" stable over time.
 */
import type { TeamAbsence, VacationBalance, VacationRequest } from "@/lib/types/redesign";

import type { VacationDocument } from "./VacationDocuments";

export const BALANCE: VacationBalance = { entitled: 20, taken: 6, pending: 5, available: 9 };

export const PENDING_FUTURE: VacationRequest = {
  id: "req-pending",
  from: "2099-12-14",
  to: "2099-12-18",
  kind: "vacaciones",
  comment: "Fin de año",
  status: "pendiente",
};

export const APPROVED_FUTURE: VacationRequest = {
  id: "req-approved-future",
  from: "2099-08-10",
  to: "2099-08-14",
  kind: "vacaciones",
  comment: "",
  status: "aprobada",
};

export const APPROVED_PAST: VacationRequest = {
  id: "req-approved-past",
  from: "2000-04-10",
  to: "2000-04-14",
  kind: "personal",
  comment: "",
  status: "aprobada",
};

export const REJECTED: VacationRequest = {
  id: "req-rejected",
  from: "2000-07-03",
  to: "2000-07-03",
  kind: "vacaciones",
  comment: "",
  status: "rechazada",
};

export const REQUESTS: VacationRequest[] = [PENDING_FUTURE, APPROVED_FUTURE, APPROVED_PAST, REJECTED];

/** As a non-decider sees it: own row with its kind, everyone else masked. */
export const ABSENCES: TeamAbsence[] = [
  { staffId: "me", name: "Ana López", from: "2026-11-09", to: "2026-11-12", kind: "enfermedad" },
  { staffId: "s2", name: "Juan Pérez", from: "2026-11-12", to: "2026-11-14", kind: "ausencia" },
  { staffId: "s3", name: "Sofía Castro", from: "2026-11-27", to: "2026-11-27", kind: "ausencia" },
];

export const DOCUMENTS: VacationDocument[] = [
  { id: "doc-1", title: "Formato de solicitud de vacaciones", url: "https://drive.google.com/file/d/abc/view", updatedAt: "2026-10-01T12:00:00.000Z" },
];
