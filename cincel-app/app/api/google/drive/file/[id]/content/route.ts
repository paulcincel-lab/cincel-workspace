import { type NextRequest, NextResponse } from "next/server";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  resolveProjectsCapabilities,
  resolveResourcesCapabilities,
} from "@/lib/auth/permissions";
import { isDriveConfigured } from "@/lib/google/client";
import { isOauthConfigured } from "@/lib/google/oauth";
import { getGoogleOauthAccount } from "@/lib/repositories/google-oauth-repository";
import { getFileContent, type DriveCaller } from "@/lib/google/drive-repository";

/** Types safe to render inline in the app's own origin; everything else downloads. */
const INLINE_SAFE = /^(application\/pdf|image\/(png|jpe?g|gif|webp|bmp)|text\/plain)(;|$)/;

/**
 * GET /api/google/drive/file/[id]/content — the file's bytes, fetched as the
 * caller's connected Google account so in-app previews don't depend on which
 * Google account the browser is signed into. Same gating as the metadata
 * route (401 / 403 / 503), plus 415/413 for folders and oversized files.
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
    return NextResponse.json({ error: "Google Drive is not configured on this server." }, { status: 503 });
  }

  const oauthAccount = await getGoogleOauthAccount(caller.member.id);
  if (!oauthAccount && !caller.email) {
    return NextResponse.json(
      { error: "Conecta tu cuenta de Google o configura un correo institucional." },
      { status: 403 }
    );
  }
  const driveCaller: DriveCaller = { staffId: caller.member.id, email: caller.email ?? "" };

  try {
    const file = await getFileContent(driveCaller, id);
    const inline = INLINE_SAFE.test(file.mimeType);
    return new NextResponse(file.body, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        // Only PDFs, raster images and plain text render inline (INLINE_SAFE);
        // anything else downloads. nosniff stops a mislabelled file from being
        // sniffed into HTML/script on our own origin.
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    if (message === "DRIVE_IS_FOLDER") {
      return NextResponse.json({ error: "Las carpetas no tienen vista previa." }, { status: 415 });
    }
    if (message === "DRIVE_TOO_LARGE") {
      return NextResponse.json({ error: "El archivo es demasiado grande para la vista previa." }, { status: 413 });
    }
    if (message.startsWith("DRIVE_API_404")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: `Drive request failed: ${message}` }, { status: 502 });
  }
}
