import type { NextRequest } from "next/server";

import { handlePortalFileRequest } from "@/lib/portal/file-route";

type Context = { params: Promise<{ pid: string; fileId: string }> };

/**
 * GET /api/portal/projects/[pid]/files/[fileId]/download (BE §B.4.5): the file as an
 * attachment. Google-native documents arrive as PDF (422 `export_too_large`
 * past Drive's 10 MB export limit). 401 `{ redirect }` without a portal
 * session; 404 without access or for anything outside `02 Cliente`.
 */
export async function GET(request: NextRequest, { params }: Context): Promise<Response> {
  const { pid, fileId } = await params;
  return handlePortalFileRequest(request, pid, fileId, "download");
}
