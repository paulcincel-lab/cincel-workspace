import { button, htmlDocument, note, paragraph, trimOrigin, type MailContent } from "./layout";

export type SolicitudAprobacionParams = {
  /** Staff member who asks for the approval. */
  staffName: string;
  projectName: string;
  projectId: string;
  /** Name of the file in the project's `02 Cliente` folder. */
  fileName: string;
  /** Free text from the staff member; shown as plain, escaped text. */
  message: string;
  /** `APP_ORIGIN`, e.g. `https://app.cincel.mx`. */
  appOrigin: string;
};

/**
 * "Solicitud de aprobación" (client, portal mail layout): a staff member asks
 * the client to review one file of the project. The button opens the project
 * in the portal, where the file is listed under Archivos; it never carries a
 * Drive link, so the client only sees what the portal shows.
 */
export function solicitudAprobacionEmail(params: SolicitudAprobacionParams): MailContent {
  const { staffName, projectName, projectId, fileName, message, appOrigin } = params;
  const projectUrl = `${trimOrigin(appOrigin)}/portal/proyectos/${encodeURIComponent(projectId)}`;
  const intro = `${staffName} te pide revisar y aprobar ${fileName} del proyecto ${projectName}.`;
  const body = message.trim();
  const how = "Abre el proyecto en el portal; el archivo está en Archivos. Responde a este correo con tu aprobación o tus comentarios.";
  return {
    subject: `Aprobación pendiente: ${fileName} · ${projectName}`,
    text: `${intro}\n\n${body ? `${body}\n\n` : ""}${how}\n${projectUrl}\n`,
    html: htmlDocument([
      paragraph(intro),
      ...(body ? [paragraph(body)] : []),
      paragraph(how),
      button("Abrir el proyecto", projectUrl),
      note(`Si el botón no funciona, copia este enlace: ${projectUrl}`),
    ]),
  };
}
