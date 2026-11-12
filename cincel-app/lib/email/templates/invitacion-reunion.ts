import { button, htmlDocument, paragraph, type MailContent } from "./layout";

export type InvitacionReunionParams = {
  title: string;
  when: string;
  location: string | null;
  /** Link to the meeting in Cincel; no `.ics` is attached (BE §7.6). */
  meetingUrl: string;
  organizerName: string;
  kind: "invitacion" | "cambio" | "cancelacion";
};

const SUBJECT_PREFIX: Record<InvitacionReunionParams["kind"], string> = {
  invitacion: "Invitación",
  cambio: "Reunión cambiada",
  cancelacion: "Reunión cancelada",
};

/** Invitation, change and cancel notice of a meeting on the failure path (BE §7.6). */
export function invitacionReunionEmail(params: InvitacionReunionParams): MailContent {
  const { title, when, location, meetingUrl, organizerName, kind } = params;
  const intro =
    kind === "invitacion"
      ? `${organizerName} te invitó a una reunión.`
      : kind === "cambio"
        ? `${organizerName} cambió la reunión.`
        : `${organizerName} canceló la reunión.`;
  const details = [`Reunión: ${title}`, `Cuándo: ${when}`];
  const place = location?.trim();
  if (place) details.push(`Dónde: ${place}`);
  const label = kind === "cancelacion" ? "Ver en Cincel" : "Ver la reunión";

  const text = `${[intro, details.join("\n"), `${label}: ${meetingUrl}`].join("\n\n")}\n`;
  const html = htmlDocument([
    paragraph(intro),
    ...details.map(paragraph),
    button(label, meetingUrl),
  ]);
  return { subject: `${SUBJECT_PREFIX[kind]}: ${title}`, text, html };
}
