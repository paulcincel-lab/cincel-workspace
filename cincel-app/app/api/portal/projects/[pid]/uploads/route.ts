import { after, NextResponse, type NextRequest } from "next/server";

import { clientIp } from "@/lib/auth/rate-limit";
import { portalErrorResponse, requirePortalApiUser, requireProjectAccess } from "@/lib/portal/session";
import { receivePortalUpload, type PortalUploadFailure } from "@/lib/portal/upload-pipeline";
import { getPortalUploadDrive, notifyPortalUpload, recordPortalUploadEvent } from "@/lib/portal/upload-service";
import { listOwnPortalUploads, toPortalUploadDTO } from "@/lib/portal/uploads";
import type { PortalUploadDTO } from "@/lib/types/portal";

type Context = { params: Promise<{ pid: string }> };

/**
 * GET /api/portal/projects/[pid]/uploads (BE §B.4.7): Mis envíos. Only the
 * caller's own `upload` events for this project; clients can't list
 * `03 Del cliente`, so other clients' and staff files never show up.
 * 401 `{ redirect }` without a portal session, 404 without access.
 */
export async function GET(_request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { pid } = await params;
  try {
    const user = await requirePortalApiUser();
    const project = await requireProjectAccess(pid, user);
    const uploads: PortalUploadDTO[] = await listOwnPortalUploads(user.id, project.projectId);
    return NextResponse.json(uploads, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = portalErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

const NO_STORE = { "Cache-Control": "private, no-store" };

const FOLDER_NOT_READY_MESSAGE = "Aún no puedes enviar archivos a este proyecto";

const UPLOAD_ERRORS: Record<PortalUploadFailure["error"], { status: number; message: string }> = {
  too_large: { status: 413, message: "El archivo supera 50 MB" },
  unsupported_type: { status: 415, message: "Tipo de archivo no permitido" },
  invalid_request: { status: 400, message: "No se recibió el archivo" },
  upload_failed: { status: 502, message: "No se pudo guardar el archivo; intenta de nuevo" },
};

function uploadError(status: number, error: string, message: string): NextResponse {
  return NextResponse.json({ error, message }, { status, headers: NO_STORE });
}

/**
 * POST /api/portal/projects/[pid]/uploads (BE §B.4.7): one multipart `file`
 * per request, streamed into the project's `03 Del cliente` folder as
 * `YYYY-MM-DD · {cliente} · {nombre}`. 401 `{ redirect }` without a portal
 * session, 404 without access, 409 while the Drive folders aren't ready,
 * 413 past 50 MB, 415 for a type outside the allowlist or content that
 * doesn't match its extension. On success the event is logged, staff are
 * emailed after the response, and the answer is 201 `PortalUploadDTO`.
 */
export async function POST(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { pid } = await params;
  try {
    const user = await requirePortalApiUser();
    const project = await requireProjectAccess(pid, user);
    const inboundFolderId = project.driveInboundFolderId;
    if (project.driveFolderStatus !== "ready" || !inboundFolderId) {
      return uploadError(409, "folder_not_ready", FOLDER_NOT_READY_MESSAGE);
    }

    const drive = getPortalUploadDrive();
    if (!drive) return uploadError(503, "drive_unavailable", UPLOAD_ERRORS.upload_failed.message);

    const result = await receivePortalUpload({ request, inboundFolderId, clientName: user.name, now: new Date() }, drive);
    if (!result.ok) {
      const { status, message } = UPLOAD_ERRORS[result.error];
      return uploadError(status, result.error, message);
    }

    const event = await recordPortalUploadEvent({
      portalUserId: user.id,
      projectId: project.projectId,
      driveFileId: result.file.id,
      fileName: result.originalName,
      sizeBytes: result.sizeBytes,
      ip: clientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });

    after(() =>
      notifyPortalUpload({
        project: { name: project.name, managerId: project.managerId, coordinatorId: project.coordinatorId },
        clientName: user.name,
        fileName: result.originalName,
        inboundFolderId,
      })
    );

    const upload: PortalUploadDTO = toPortalUploadDTO(event);
    return NextResponse.json(upload, { status: 201, headers: NO_STORE });
  } catch (error) {
    const response = portalErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
