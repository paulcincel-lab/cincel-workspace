import { button, htmlDocument, paragraph, type MailContent } from "./layout";

export type ArchivoRecibidoParams = {
  clientName: string;
  projectName: string;
  fileName: string;
  /** Drive link to the project's `03 Del cliente` folder. */
  folderUrl: string;
};

/** "Archivo recibido" (staff): a client uploaded a file through the portal. */
export function archivoRecibidoEmail(params: ArchivoRecibidoParams): MailContent {
  const { clientName, projectName, fileName, folderUrl } = params;
  const body = `${clientName} subió ${fileName} al proyecto ${projectName}.`;
  const where = "Está en 03 Del cliente:";
  return {
    subject: `${clientName} envió un archivo a ${projectName}`,
    text: `${body} ${where} ${folderUrl}\n`,
    html: htmlDocument([paragraph(body), paragraph(where), button("Abrir carpeta", folderUrl)]),
  };
}
