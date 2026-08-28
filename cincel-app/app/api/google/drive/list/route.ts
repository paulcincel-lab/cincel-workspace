import { type NextRequest, NextResponse } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  resolveProjectsCapabilities,
  resolveResourcesCapabilities,
} from "@/lib/auth/permissions";
import { getDriveClient, getDriveRootFolderId } from "@/lib/google/client";
import { listFolder, searchFiles } from "@/lib/google/drive-repository";

/**
 * GET /api/google/drive/list?folderId=&q=&pageToken=
 *
 * Browse the service-account Drive. Auth gating mirrors
 * app/api/team/sensitive/[id]/route.ts:
 *   - no session         -> 401
 *   - no Drive capability -> 403
 *   - Drive not configured -> 503
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  let caller;
  try {
    caller = await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const canBrowse =
    resolveResourcesCapabilities(caller).canViewResources ||
    resolveProjectsCapabilities(caller).canViewProjects;
  if (!canBrowse) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!getDriveClient()) {
    return NextResponse.json(
      { error: "Google Drive is not configured on this server." },
      { status: 503 }
    );
  }

  const params = request.nextUrl.searchParams;
  const folderId = params.get("folderId") || getDriveRootFolderId();
  const query = params.get("q")?.trim();
  const pageToken = params.get("pageToken") || undefined;

  if (!folderId && !query) {
    return NextResponse.json(
      { error: "No folderId given and GOOGLE_DRIVE_ROOT_FOLDER_ID is unset." },
      { status: 400 }
    );
  }

  try {
    if (query) {
      const entries = await searchFiles(query, folderId ?? undefined);
      return NextResponse.json({ entries, nextPageToken: null });
    }
    const listing = await listFolder(folderId as string, pageToken);
    return NextResponse.json(listing);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "DRIVE_NOT_CONFIGURED") {
      return NextResponse.json(
        { error: "Google Drive is not configured." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: `Drive request failed: ${message}` },
      { status: 502 }
    );
  }
}
