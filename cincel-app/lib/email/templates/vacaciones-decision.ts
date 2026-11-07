import { notImplemented } from "@/lib/stubs";

import type { MailContent } from "./layout";

export type VacacionesDecisionParams = {
  decision: "aprobada" | "rechazada";
  /** YYYY-MM-DD. */
  from: string;
  to: string;
  days: number;
  approverName: string;
  note: string | null;
};

/** "Tu solicitud de vacaciones fue aprobada|rechazada" with dates, days, approver and note (redesign BE §11.3). */
export function vacacionesDecisionEmail(params: VacacionesDecisionParams): MailContent {
  return notImplemented("vacacionesDecisionEmail", params);
}
