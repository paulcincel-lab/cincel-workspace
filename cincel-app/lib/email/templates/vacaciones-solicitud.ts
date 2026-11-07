import { notImplemented } from "@/lib/stubs";

import type { MailContent } from "./layout";

export type VacacionesSolicitudParams = {
  requesterName: string;
  /** YYYY-MM-DD. */
  from: string;
  to: string;
  days: number;
  /** Absolute link for "Revisar solicitudes". */
  url: string;
};

/**
 * To deciders: "Nueva solicitud de ausencia de <nombre>" with dates and days,
 * never the kind (privacy, redesign BE §8.8, §11.3).
 */
export function vacacionesSolicitudEmail(params: VacacionesSolicitudParams): MailContent {
  return notImplemented("vacacionesSolicitudEmail", params);
}
