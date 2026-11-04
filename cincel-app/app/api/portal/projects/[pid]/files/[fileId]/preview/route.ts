import type { NextRequest } from "next/server";

import { handlePortalFileRequest } from "@/lib/portal/file-route";

type Context = { params: Promise<{ pid: string; fileId: string }> };

/**
 * GET /api/portal/projects/[pid]/files/[fileId]/preview (BE §B.4.5): the file
 * inline, for PDF, JPEG, PNG, WebP and GIF only (415 otherwise, SVG included).
 * Google-native documents preview as their PDF export. 401 `{ redirect }`
 * without a portal session; 404 without access or outside `02 Cliente`.
 */
export async function GET(request: NextRequest, { params }: Context): Promise<Response> {
  const { pid, fileId } = await params;
  return handlePortalFileRequest(request, pid, fileId, "preview");
}
