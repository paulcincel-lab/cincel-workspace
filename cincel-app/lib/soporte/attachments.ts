import "server-only";

/**
 * Solicitud attachments (#1112): validation, EXIF stripping, storage and
 * reading. Bytes live in `support_ticket_attachment_blobs` (private, Postgres
 * like staff photos); `file_key` is `blob:<attachment id>`. Nothing here is
 * public: the authenticated route is the only reader.
 */
import { randomUUID } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";
import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { supportTicketAttachmentBlobs, supportTicketAttachments, supportTickets } from "@/lib/db/schema";
import { isPhotoMime, MalformedImageError, stripImageMetadata } from "@/lib/profile-photo/strip-metadata";
import {
  ATTACHMENT_ERRORS,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
} from "@/lib/soporte/attachments-rules";
import type { ActionResult } from "@/lib/types/schedule";
import type { TicketAttachment } from "@/lib/types/soporte";

export {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MIME_TYPES,
  type AttachmentMime,
} from "@/lib/soporte/attachments-rules";

const MAX_NAME_LENGTH = 120;

function cleanName(name: string, mime: string): string {
  const base = name.replace(/[\\/\u0000-\u001f]/g, "").trim().slice(0, MAX_NAME_LENGTH);
  if (base) return base;
  return `captura.${mime === "image/jpeg" ? "jpg" : mime.slice(6)}`;
}

/**
 * Validates by magic bytes (the declared type is never trusted) and strips
 * EXIF and other metadata. Returns the clean bytes and the real type.
 */
export async function sanitizeAttachment(
  bytes: Uint8Array
): Promise<{ ok: true; mime: "image/png" | "image/jpeg" | "image/webp"; bytes: Buffer } | { ok: false; error: string }> {
  if (bytes.byteLength === 0) return { ok: false, error: ATTACHMENT_ERRORS.empty };
  if (bytes.byteLength > ATTACHMENT_MAX_BYTES) return { ok: false, error: ATTACHMENT_ERRORS.tooLarge };
  const detected = await fileTypeFromBuffer(bytes);
  const mime = detected?.mime;
  if (!isPhotoMime(mime)) return { ok: false, error: ATTACHMENT_ERRORS.invalidType };
  try {
    const clean = stripImageMetadata(bytes, mime);
    if (clean.byteLength > ATTACHMENT_MAX_BYTES) return { ok: false, error: ATTACHMENT_ERRORS.tooLarge };
    return { ok: true, mime, bytes: clean };
  } catch (error) {
    if (error instanceof MalformedImageError) return { ok: false, error: ATTACHMENT_ERRORS.malformed };
    throw error;
  }
}

/** Strips EXIF, stores the image in private storage and records it on the ticket. */
export async function saveTicketAttachment(
  ticketId: string,
  file: { name: string; mime: string; bytes: Uint8Array }
): Promise<ActionResult<TicketAttachment>> {
  const clean = await sanitizeAttachment(file.bytes);
  if (!clean.ok) return { ok: false, error: clean.error };

  const id = randomUUID();
  const name = cleanName(file.name, clean.mime);

  return db.transaction(async (tx) => {
    // Lock the ticket row so two parallel uploads can't both pass the count.
    const [ticket] = await tx
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .for("update");
    if (!ticket) return { ok: false, error: ATTACHMENT_ERRORS.notFound } as const;

    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTicketAttachments)
      .where(eq(supportTicketAttachments.ticketId, ticketId));
    if (count >= ATTACHMENT_MAX_COUNT) return { ok: false, error: ATTACHMENT_ERRORS.tooMany } as const;

    await tx.insert(supportTicketAttachments).values({
      id,
      ticketId,
      fileKey: `blob:${id}`,
      mime: clean.mime,
      size: clean.bytes.byteLength,
      name,
    });
    await tx.insert(supportTicketAttachmentBlobs).values({ attachmentId: id, bytes: clean.bytes });
    return { ok: true, data: { id, name, mime: clean.mime, size: clean.bytes.byteLength } } as const;
  });
}

/** The attachments of a ticket, oldest first, without bytes. */
export async function listTicketAttachments(ticketId: string): Promise<TicketAttachment[]> {
  return db
    .select({
      id: supportTicketAttachments.id,
      name: supportTicketAttachments.name,
      mime: supportTicketAttachments.mime,
      size: supportTicketAttachments.size,
    })
    .from(supportTicketAttachments)
    .where(eq(supportTicketAttachments.ticketId, ticketId))
    .orderBy(supportTicketAttachments.createdAt, supportTicketAttachments.id);
}

/** Who wrote a ticket; null when there is no such ticket. */
export async function findTicketAuthor(ticketId: string): Promise<string | null> {
  const [row] = await db
    .select({ createdBy: supportTickets.createdBy })
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId));
  return row?.createdBy ?? null;
}

/** The attachment bytes for the authenticated route; null when missing or not visible to the viewer. */
export async function readTicketAttachment(
  viewer: { staffId: string; canManageSupport: boolean },
  id: string
): Promise<{ mime: string; name: string; bytes: Uint8Array } | null> {
  const [row] = await db
    .select({
      mime: supportTicketAttachments.mime,
      name: supportTicketAttachments.name,
      createdBy: supportTickets.createdBy,
      bytes: supportTicketAttachmentBlobs.bytes,
    })
    .from(supportTicketAttachments)
    .innerJoin(supportTickets, eq(supportTickets.id, supportTicketAttachments.ticketId))
    .innerJoin(
      supportTicketAttachmentBlobs,
      eq(supportTicketAttachmentBlobs.attachmentId, supportTicketAttachments.id)
    )
    .where(eq(supportTicketAttachments.id, id));
  if (!row) return null;
  if (!viewer.canManageSupport && row.createdBy !== viewer.staffId) return null;
  return { mime: row.mime, name: row.name, bytes: new Uint8Array(row.bytes) };
}
