/**
 * POST /api/staff/me/photo (redesign BE §7.2, §8.11): `multipart/form-data`
 * field `file` (≤ 2 MB, jpeg / png / webp by magic bytes), metadata stripped,
 * stored in `staff_photos`; `200 { url }`, 401, `413 TOO_LARGE`,
 * `415 INVALID_TYPE`, `429 RATE_LIMITED`; revalidates the root layout.
 *
 * Contract stub.
 */
import type { NextRequest, NextResponse } from "next/server";

import { notImplemented } from "@/lib/stubs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return notImplemented("POST /api/staff/me/photo", request);
}
