/**
 * GET /api/staff/[id]/photo (redesign BE §7.2): image bytes with `ETag` =
 * sha256, `Cache-Control: private, max-age=86400`, `304` on match; 401
 * without a session, 404 when there is no photo.
 */
import { type NextRequest, NextResponse } from "next/server";

import { getSessionAccess } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { ifNoneMatchHits, photoEtag } from "@/lib/profile-photo/upload";
import { findStaffPhoto } from "@/lib/repositories/preferences-repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_CONTROL = "private, max-age=86400";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const access = await getSessionAccess();
  if (!access.user) {
    return access.status === "no_system_access"
      ? NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })
      : NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { id } = await context.params;
  const photo = UUID.test(id) ? await findStaffPhoto(db, id) : null;
  if (!photo) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }

  const etag = photoEtag(photo.sha256);
  const headers = { ETag: etag, "Cache-Control": CACHE_CONTROL, Vary: "Cookie" };
  if (ifNoneMatchHits(request.headers.get("if-none-match"), etag)) {
    return new NextResponse(null, { status: 304, headers });
  }

  const bytes = Buffer.from(photo.bytes);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": photo.mime,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
