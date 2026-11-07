/**
 * GET /api/horario/export?week=YYYY-MM-DD (redesign BE §7.7): CSV for
 * `canViewTeamHours` (403 otherwise), BOM, formula-leading cells escaped, days
 * before `requiredFrom` excluded and counted in `X-Cincel-Trial-Days`.
 *
 * Contract stub.
 */
import type { NextRequest, NextResponse } from "next/server";

import { notImplemented } from "@/lib/stubs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return notImplemented("GET /api/horario/export", request);
}
