import { NextResponse, type NextRequest } from "next/server";

import { portalErrorResponse, requirePortalApiUser, requireProjectAccess } from "@/lib/portal/session";
import { listOwnPortalUploads } from "@/lib/portal/uploads";
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
