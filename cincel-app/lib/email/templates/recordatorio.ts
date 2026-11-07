import { notImplemented } from "@/lib/stubs";

import type { MailContent } from "./layout";

export type RecordatorioParams = {
  /** The reminder text. */
  text: string;
  /** ISO instant; rendered in America/Mexico_City. */
  dueAt: string;
  /** Absolute link for "Abrir en Cincel". */
  url: string;
};

/** "Recordatorio: <texto>" with the due time and a button "Abrir en Cincel" (redesign BE §11.3). */
export function recordatorioEmail(params: RecordatorioParams): MailContent {
  return notImplemented("recordatorioEmail", params);
}
