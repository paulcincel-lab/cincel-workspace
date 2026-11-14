"use client";

import { attachmentUrl } from "@/lib/soporte/attachments-rules";
import type { TicketAttachment } from "@/lib/types/soporte";

/** Thumbnails of a solicitud's images (Mis solicitudes and Mejoras). Each opens the full image in a new tab. */
export function AttachmentThumbs({ attachments }: { attachments: TicketAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <ul aria-label="Imágenes adjuntas" className="flex flex-wrap gap-2">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <a href={attachmentUrl(attachment.id)} target="_blank" rel="noreferrer" aria-label={`Abrir ${attachment.name}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachmentUrl(attachment.id)}
              alt={attachment.name}
              loading="lazy"
              className="size-20 rounded-md border border-border object-cover"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
