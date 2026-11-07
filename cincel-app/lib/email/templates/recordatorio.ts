import { button, formatMailDateTime, htmlDocument, paragraph, type MailContent } from "./layout";

export type RecordatorioParams = {
  /** The reminder text. */
  text: string;
  /** ISO instant; rendered in America/Mexico_City. */
  dueAt: string;
  /** Absolute link for "Abrir en Cincel". */
  url: string;
};

/** "Recordatorio: <texto>" with the due time and a button "Abrir en Cincel" (redesign BE §11.3). */
export function recordatorioEmail({ text, dueAt, url }: RecordatorioParams): MailContent {
  const reminder = text.trim();
  const when = `Para el ${formatMailDateTime(dueAt)}.`;
  return {
    subject: `Recordatorio: ${reminder.replace(/\s+/g, " ")}`,
    text: `${reminder}\n\n${when}\n\nAbrir en Cincel: ${url}\n`,
    html: htmlDocument([paragraph(reminder), paragraph(when), button("Abrir en Cincel", url)]),
  };
}
