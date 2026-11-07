import { button, formatDateRange, formatDays, htmlDocument, paragraph, type MailContent } from "./layout";

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
  const { requesterName, from, to, days, url } = params;
  const body = `${requesterName} pidió una ausencia ${formatDateRange(from, to)} (${formatDays(days)}).`;
  return {
    subject: `Nueva solicitud de ausencia de ${requesterName}`,
    text: `${body}\n\nRevisar solicitudes: ${url}\n`,
    html: htmlDocument([paragraph(body), button("Revisar solicitudes", url)]),
  };
}
