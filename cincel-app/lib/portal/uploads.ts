import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { portalFileEvents } from "@/lib/db/schema";
import type { PortalUploadDTO } from "@/lib/types/portal";

/**
 * Mis envíos (BE §B.4.7): the files this portal user sent to this project,
 * newest first. Clients can't list `03 Del cliente`, so this reads only the
 * caller's own `upload` events: other clients' uploads, staff files and the
 * caller's downloads and previews are never returned. The Drive file id is
 * not part of the DTO.
 */
export async function listOwnPortalUploads(portalUserId: string, projectId: string): Promise<PortalUploadDTO[]> {
  const rows = await db
    .select({
      id: portalFileEvents.id,
      fileName: portalFileEvents.fileName,
      sizeBytes: portalFileEvents.sizeBytes,
      at: portalFileEvents.at,
    })
    .from(portalFileEvents)
    .where(
      and(
        eq(portalFileEvents.portalUserId, portalUserId),
        eq(portalFileEvents.projectId, projectId),
        eq(portalFileEvents.action, "upload")
      )
    )
    .orderBy(desc(portalFileEvents.at), desc(portalFileEvents.id));
  return rows.map(toPortalUploadDTO);
}

export function toPortalUploadDTO(row: {
  id: string;
  fileName: string;
  sizeBytes: number | null;
  at: Date;
}): PortalUploadDTO {
  return { id: row.id, fileName: row.fileName, sizeBytes: row.sizeBytes, at: row.at.toISOString() };
}

/**
 * Drive ids of the files this portal user sent to this project (own `upload` events only), for "Subido por"
 * on Resumen: a listed file whose id is here shows "Tú", anything else "Cincel". The ids never leave the server.
 */
export async function listOwnPortalUploadFileIds(portalUserId: string, projectId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ driveFileId: portalFileEvents.driveFileId })
    .from(portalFileEvents)
    .where(
      and(
        eq(portalFileEvents.portalUserId, portalUserId),
        eq(portalFileEvents.projectId, projectId),
        eq(portalFileEvents.action, "upload")
      )
    );
  return new Set(rows.map((r) => r.driveFileId));
}
