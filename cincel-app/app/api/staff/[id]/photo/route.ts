/**
 * GET /api/staff/[id]/photo (redesign BE §7.2): image bytes with `ETag` =
 * sha256, `Cache-Control: private, max-age=86400`, `304` on match; 401
 * without a session, 404 when there is no photo.
 *
 * Contract stub.
 */
import type { NextRequest, NextResponse } from "next/server";

import { notImplemented } from "@/lib/stubs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  return notImplemented("GET /api/staff/[id]/photo", request, context);
}
