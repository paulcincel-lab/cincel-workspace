import { button, htmlDocument, note, paragraph, trimOrigin, type MailContent } from "./layout";

export type InvitacionParams = {
  /** Staff member who sent the invite. */
  staffName: string;
  projectName: string;
  /** `APP_ORIGIN`, e.g. `https://app.cincel.mx`. */
  appOrigin: string;
};

/**
 * "Invitación" (BE §B.6): tells the client they were invited and links to
 * `/portal/login`. The link deliberately has no `?email=` (review NB 10): an
 * address in the query string ends up in proxy logs, browser history and
 * referrers, and the client types it once on the login page anyway.
 */
export function invitacionEmail({ staffName, projectName, appOrigin }: InvitacionParams): MailContent {
  const loginUrl = `${trimOrigin(appOrigin)}/portal/login`;
  const intro = `${staffName} te invitó a ver el proyecto ${projectName} en Cincel.`;
  const how = "Entra con tu correo y te enviaremos un enlace de acceso.";
  return {
    subject: `Te invitaron a ver ${projectName} en Cincel`,
    text: `${intro}\n\n${how}\n${loginUrl}\n`,
    html: htmlDocument([
      paragraph(intro),
      paragraph(how),
      button("Entrar al portal", loginUrl),
      note(`Si el botón no funciona, copia este enlace: ${loginUrl}`),
    ]),
  };
}
