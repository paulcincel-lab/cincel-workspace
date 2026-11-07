import { notImplemented } from "@/lib/stubs";

import type { MailContent } from "./layout";

export type ResumenDiarioItem = { title: string; url: string };

export type ResumenDiarioParams = {
  /** Sections with no items are omitted. */
  asignaciones: ResumenDiarioItem[];
  menciones: ResumenDiarioItem[];
  vencimientos: ResumenDiarioItem[];
  comentarios: ResumenDiarioItem[];
};

/** "Tu resumen de hoy en Cincel": Asignaciones, Menciones, Vencimientos, Comentarios (redesign BE §11.3). */
export function resumenDiarioEmail(params: ResumenDiarioParams): MailContent {
  return notImplemented("resumenDiarioEmail", params);
}
