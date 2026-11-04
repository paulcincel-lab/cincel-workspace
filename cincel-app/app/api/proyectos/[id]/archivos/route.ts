import { type NextRequest, NextResponse } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { getStaffFilesProject, listStaffProjectFiles } from "@/lib/google/staff-files-app";
import { isStaffFolderNotFound } from "@/lib/google/staff-files";

/**
 * GET /api/proyectos/[id]/archivos?folder=<id> — the project's Drive folder
 * for the staff Archivos tab (backend spec §A.6.3). Always 200 with a
 * StaffFilesResult, except:
 *   - no staff session                                  -> 401
 *   - unknown or deleted project, folder outside it     -> 404
 *   - service account or Drive failure                  -> 502
 * All staff can view; there is no capability check.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  let caller;
  try {
    caller = await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;
  const project = await getStaffFilesProject(projectId);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const folder = request.nextUrl.searchParams.get("folder")?.trim() || null;
  try {
    const result = await listStaffProjectFiles(caller.member.id, project, folder);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (isStaffFolderNotFound(error)) return NextResponse.json({ error: "not_found" }, { status: 404 });
    console.error("[archivos] Drive request failed", error);
    return NextResponse.json({ error: "drive_error" }, { status: 502 });
  }
}
