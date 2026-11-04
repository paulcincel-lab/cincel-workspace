import { type NextRequest, NextResponse } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  resolveProjectsCapabilities,
  resolveResourcesCapabilities,
} from "@/lib/auth/permissions";
import { getDriveRootFolderId, resolvePickerDriveCaller } from "@/lib/google/picker-drive";
import { listFolder, searchFiles } from "@/lib/google/drive-repository";

/**
 * GET /api/google/drive/list?folderId=&q=&pageToken=
 *
 * Drive is read with the staff member's own Google token (lib/google/picker-drive.ts).
 * Auth gating:
 *   - no session                -> 401
 *   - no Drive capability       -> 403
 *   - nothing configured at all -> 503
 *   - no Drive grant            -> 403 { error: "needs_consent" }
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

  const resolved = await resolvePickerDriveCaller(caller.member.id, caller.email ?? "");
  if (!resolved.ok) return resolved.response;
  const driveCaller = resolved.caller;

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
      const entries = await searchFiles(driveCaller, query, folderId ?? undefined);
      return NextResponse.json({ entries, nextPageToken: null });
    }
    const listing = await listFolder(driveCaller, folderId as string, pageToken);
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
