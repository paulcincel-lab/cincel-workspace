import { type NextRequest, NextResponse } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  resolveProjectsCapabilities,
  resolveResourcesCapabilities,
} from "@/lib/auth/permissions";
import { isDriveConfigured } from "@/lib/google/client";
import { isOauthConfigured } from "@/lib/google/oauth";
import { getGoogleOauthAccount } from "@/lib/repositories/google-oauth-repository";
import { getFileMeta, type DriveCaller } from "@/lib/google/drive-repository";

/**
 * GET /api/google/drive/file/[id] — metadata for a single Drive file/folder.
 * Same auth gating as the list route (401 / 403 / 503).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

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

  if (!isDriveConfigured() && !isOauthConfigured()) {
    return NextResponse.json(
      { error: "Google Drive is not configured on this server." },
      { status: 503 }
    );
  }

  const oauthAccount = await getGoogleOauthAccount(caller.member.id);
  if (!oauthAccount && !caller.email) {
    return NextResponse.json(
      { error: "Conecta tu cuenta de Google o configura un correo institucional." },
      { status: 403 }
    );
  }
  const driveCaller: DriveCaller = { staffId: caller.member.id, email: caller.email ?? "" };

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getFileMeta(driveCaller, id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message.startsWith("DRIVE_API_404")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      { error: `Drive request failed: ${message}` },
      { status: 502 }
    );
  }
}
