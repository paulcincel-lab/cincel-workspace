import "server-only";

import { deliverPortalFile, portalFileNotFound, type PortalFileDeps } from "@/lib/portal/file-delivery";
import type { PortalProjectAccess } from "@/lib/portal/session-store";

/**
 * The project's cover photo for the portal Resumen hero (Portal Visual). Staff set
 * `projects.cover_drive_file_id` to an image inside `02 Cliente`; the portal serves it inline through the same
 * ancestry guard and delivery as a file preview. Anything that is not an image answers 404, so the page keeps
 * its gradient. A cover is page chrome, not a document the client opened, so no `portal_file_events` row.
 */

export type PortalCoverDeps = Pick<PortalFileDeps, "assertInsideClientFolder" | "drive"> & {
  getCoverFileId(access: PortalProjectAccess): Promise<string | null>;
};

export async function deliverPortalCover(
  request: { access: PortalProjectAccess; portalUserId: string },
  deps: PortalCoverDeps,
): Promise<Response> {
  const fileId = await deps.getCoverFileId(request.access);
  if (!fileId) return portalFileNotFound();

  const response = await deliverPortalFile(
    { kind: "preview", fileId, project: request.access, portalUserId: request.portalUserId, ip: null, userAgent: null },
    { assertInsideClientFolder: deps.assertInsideClientFolder, drive: deps.drive, recordEvent: async () => undefined },
  );
  if (!response.ok) return response.status === 404 ? response : portalFileNotFound();
  if (!(response.headers.get("Content-Type") ?? "").startsWith("image/")) {
    await response.body?.cancel().catch(() => undefined);
    return portalFileNotFound();
  }
  // The cover changes rarely; let the browser keep it for a minute like the listings.
  response.headers.set("Cache-Control", "private, max-age=60");
  return response;
}
