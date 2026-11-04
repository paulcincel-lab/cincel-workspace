import { NextResponse, type NextRequest } from "next/server";

import { listPortalFolder, PortalDriveUnavailableError } from "@/lib/portal/files";
import { portalErrorResponse, requirePortalApiUser, requireProjectAccess } from "@/lib/portal/session";
import type { PortalFolderDTO, PortalFolderPendingDTO } from "@/lib/types/portal";

type Context = { params: Promise<{ pid: string }> };

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/portal/projects/[pid]/files?folder=<fid> (BE §B.4.4): the contents
 * of the project's `02 Cliente`, or of a folder under it, through the service
 * account. `{ pending: true }` while the project's Drive folders aren't ready.
 * 401 `{ redirect }` without a portal session; 404 without access, or for a
 * folder outside `02 Cliente` (`01 Interno`, another project, unknown ids).
 */
export async function GET(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const { pid } = await params;
  try {
    const user = await requirePortalApiUser();
    const project = await requireProjectAccess(pid, user);
    if (project.driveFolderStatus !== "ready" || !project.driveClientFolderId) {
      const pending: PortalFolderPendingDTO = { pending: true };
      return NextResponse.json(pending, { headers: NO_STORE });
    }

    const folder = request.nextUrl.searchParams.get("folder")?.trim() || null;
    const listing: PortalFolderDTO = await listPortalFolder(
      { driveClientFolderId: project.driveClientFolderId },
      folder
    );
    return NextResponse.json(listing, { headers: NO_STORE });
  } catch (error) {
    const response = portalErrorResponse(error);
    if (response) return response;
    if (error instanceof PortalDriveUnavailableError) {
      return NextResponse.json({ error: "drive_unavailable" }, { status: 503, headers: NO_STORE });
    }
    throw error;
  }
}
