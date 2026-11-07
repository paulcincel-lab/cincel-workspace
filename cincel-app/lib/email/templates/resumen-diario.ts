import { heading, htmlDocument, linkList, paragraph, type MailContent } from "./layout";

export type ResumenDiarioItem = { title: string; url: string };

export type ResumenDiarioParams = {
  /** Sections with no items are omitted. */
  asignaciones: ResumenDiarioItem[];
  menciones: ResumenDiarioItem[];
  vencimientos: ResumenDiarioItem[];
  comentarios: ResumenDiarioItem[];
};

export const RESUMEN_DIARIO_SUBJECT = "Tu resumen de hoy en Cincel";
const INTRO = "Esto es lo que pasó hoy en Cincel.";
const EMPTY = "No hay novedades hoy.";

/** "Tu resumen de hoy en Cincel": Asignaciones, Menciones, Vencimientos, Comentarios (redesign BE §11.3). */
export function resumenDiarioEmail(params: ResumenDiarioParams): MailContent {
  const sections = (
    [
      ["Asignaciones", params.asignaciones],
      ["Menciones", params.menciones],
      ["Vencimientos", params.vencimientos],
      ["Comentarios", params.comentarios],
    ] as const
  ).filter(([, items]) => items.length > 0);

  if (sections.length === 0) {
    return {
      subject: RESUMEN_DIARIO_SUBJECT,
      text: `${EMPTY}\n`,
      html: htmlDocument([paragraph(EMPTY)]),
    };
  }

  const textBlocks = sections.map(
    ([title, items]) => `${title}\n${items.map((item) => `- ${item.title}: ${item.url}`).join("\n")}`,
  );
  const htmlBlocks = sections.flatMap(([title, items]) => [
    heading(title),
    linkList(items.map((item) => ({ label: item.title, href: item.url }))),
  ]);

  return {
    subject: RESUMEN_DIARIO_SUBJECT,
    text: `${INTRO}\n\n${textBlocks.join("\n\n")}\n`,
    html: htmlDocument([paragraph(INTRO), ...htmlBlocks]),
  };
}
