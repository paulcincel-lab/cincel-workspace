import { button, htmlDocument, note, paragraph, type MailContent } from "./layout";

export type EnlaceAccesoParams = {
  /** The full magic link, `${APP_ORIGIN}/portal/acceder?token=…`. */
  url: string;
};

export const ENLACE_ACCESO_VALIDITY_NOTE = "El enlace es válido 15 minutos y es de un solo uso.";
export const ENLACE_ACCESO_IGNORE_NOTE = "Si no lo pediste, ignora este correo.";

/** "Enlace de acceso": the portal sign-in magic link (replaces the spec's "Código"). */
export function enlaceAccesoEmail({ url }: EnlaceAccesoParams): MailContent {
  const intro = "Usa este enlace para entrar al portal de Cincel:";
  return {
    subject: "Tu enlace de acceso a Cincel",
    text: `${intro}\n${url}\n\n${ENLACE_ACCESO_VALIDITY_NOTE}\n${ENLACE_ACCESO_IGNORE_NOTE}\n`,
    html: htmlDocument([
      paragraph("Usa este botón para entrar al portal de Cincel."),
      button("Entrar al portal", url),
      note(ENLACE_ACCESO_VALIDITY_NOTE),
      note(ENLACE_ACCESO_IGNORE_NOTE),
    ]),
  };
}
