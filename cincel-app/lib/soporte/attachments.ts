/**
 * Solicitud attachments (#1112): limits and server helpers. The limits are
 * final; the helpers are stubs until #1112 implements them.
 */
import type { ActionResult } from "@/lib/types/schedule";
import type { TicketAttachment } from "@/lib/types/soporte";

export const ATTACHMENT_MAX_COUNT = 3;
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIME_TYPES)[number];

/** Strips EXIF, stores the image in private storage and records it on the ticket. */
export async function saveTicketAttachment(
  _ticketId: string,
  _file: { name: string; mime: string; bytes: Uint8Array },
): Promise<ActionResult<TicketAttachment>> {
  return { ok: false, error: "NOT_IMPLEMENTED" };
}

/** The attachment bytes for the authenticated route; null when missing or not visible to the viewer. */
export async function readTicketAttachment(
  _viewer: { staffId: string; canManageSupport: boolean },
  _id: string,
): Promise<{ mime: string; name: string; bytes: Uint8Array } | null> {
  return null;
}
