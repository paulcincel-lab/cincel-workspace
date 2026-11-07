import { formatDateRange, formatDays, htmlDocument, paragraph, type MailContent } from "./layout";

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
  const { decision, from, to, days, approverName } = params;
  const verb = decision === "aprobada" ? "aprobó" : "rechazó";
  const lines = [
    `${approverName} ${verb} tu solicitud de vacaciones.`,
    `Fechas: ${formatDateRange(from, to)} (${formatDays(days)}).`,
  ];
  const note = params.note?.trim();
  if (note) lines.push(`Nota: ${note}`);
  return {
    subject: `Tu solicitud de vacaciones fue ${decision}`,
    text: `${lines.join("\n\n")}\n`,
    html: htmlDocument(lines.map(paragraph)),
  };
}
