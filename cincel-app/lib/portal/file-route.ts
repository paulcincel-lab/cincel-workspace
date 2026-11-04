import "server-only";

import { db } from "@/lib/db/client";
import { portalFileEvents } from "@/lib/db/schema";
import { clientIp } from "@/lib/auth/rate-limit";
import { createDriveAdmin, DRIVE_SCOPE, type DriveAdmin } from "@/lib/google/drive-admin";
import { getServiceAccountTokenSource } from "@/lib/google/service-account";
import { assertInsideClientFolder } from "@/lib/portal/drive-guard";
import { deliverPortalFile, type PortalFileEventInput, type PortalFileKind } from "@/lib/portal/file-delivery";
import { portalErrorResponse, requirePortalApiUser, requireProjectAccess } from "@/lib/portal/session";

/**
 * Route wiring for GET /api/portal/projects/[pid]/files/[fileId]/download and
 * /preview (BE §B.4.5): portal session (401 `{ redirect }`), project access
 * (404), then deliverPortalFile with the shared ancestry guard, the service
 * account Drive client and a `portal_file_events` writer.
 */

let serviceAccountDrive: DriveAdmin | null | undefined;

function getServiceAccountDrive(): DriveAdmin | null {
  if (serviceAccountDrive === undefined) {
    const getAccessToken = getServiceAccountTokenSource([DRIVE_SCOPE]);
    serviceAccountDrive = getAccessToken ? createDriveAdmin({ getAccessToken }) : null;
  }
  return serviceAccountDrive;
}

export async function recordPortalFileEvent(event: PortalFileEventInput): Promise<void> {
  await db.insert(portalFileEvents).values(event);
}

export async function handlePortalFileRequest(
  request: Request,
  pid: string,
  fileId: string,
  kind: PortalFileKind
): Promise<Response> {
  try {
    const user = await requirePortalApiUser();
    const project = await requireProjectAccess(pid, user);
    return await deliverPortalFile(
      {
        kind,
        fileId,
        project,
        portalUserId: user.id,
        ip: clientIp(request.headers),
        userAgent: request.headers.get("user-agent"),
      },
      { assertInsideClientFolder, drive: getServiceAccountDrive(), recordEvent: recordPortalFileEvent }
    );
  } catch (error) {
    const response = portalErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
