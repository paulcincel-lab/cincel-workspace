/**
 * Solicitud attachment rules shared by the picker (client) and the server:
 * limits, the Spanish messages and the pure validation. No server imports.
 */
export const ATTACHMENT_MAX_COUNT = 3;
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIME_TYPES)[number];

export const ATTACHMENT_ERRORS = {
  tooMany: `Puedes adjuntar hasta ${ATTACHMENT_MAX_COUNT} imágenes.`,
  tooLarge: "La imagen pesa más de 5 MB.",
  invalidType: "Solo se aceptan imágenes png, jpeg o webp.",
  empty: "La imagen está vacía.",
  malformed: "No se pudo leer la imagen.",
  rateLimited: "Has subido demasiadas imágenes. Inténtalo más tarde.",
  notFound: "No se encontró la solicitud.",
} as const;

export function isAttachmentMime(mime: string | undefined | null): mime is AttachmentMime {
  return (ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime ?? "");
}

/** The Spanish message for a file that can't be attached, or null when it is acceptable. Size and declared type only. */
export function attachmentFileError(file: { size: number; type: string }): string | null {
  if (file.size <= 0) return ATTACHMENT_ERRORS.empty;
  if (!isAttachmentMime(file.type)) return ATTACHMENT_ERRORS.invalidType;
  if (file.size > ATTACHMENT_MAX_BYTES) return ATTACHMENT_ERRORS.tooLarge;
  return null;
}

/** Merges new files into the current list: over-limit and wrong-type files are rejected, with a message each. */
export function addAttachmentFiles<T extends { size: number; type: string; name: string }>(
  current: readonly T[],
  incoming: readonly T[],
): { files: T[]; errors: string[] } {
  const files = [...current];
  const errors: string[] = [];
  for (const file of incoming) {
    const problem = attachmentFileError(file);
    if (problem) {
      errors.push(`${file.name || "Imagen"}: ${problem}`);
    } else if (files.length >= ATTACHMENT_MAX_COUNT) {
      if (!errors.includes(ATTACHMENT_ERRORS.tooMany)) errors.push(ATTACHMENT_ERRORS.tooMany);
    } else {
      files.push(file);
    }
  }
  return { files, errors };
}

/** The URL of the authenticated route that serves an attachment. */
export function attachmentUrl(id: string): string {
  return `/api/soporte/adjuntos/${id}`;
}
