/**
 * GET /api/horario/export?week=YYYY-MM-DD (redesign BE §7.7): the payroll CSV
 * of one week for `canViewTeamHours` (401 without a session, 403 otherwise,
 * 400 `INVALID` unless `week` is a Monday). `text/csv; charset=utf-8` with a
 * BOM, file `horario-<week>.csv`, formula-leading cells escaped, days before
 * `requiredFrom` excluded and counted in `X-Cincel-Trial-Days`.
 */
import { NextResponse, type NextRequest } from "next/server";

import { canViewTeamHours } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { teamHoursCsv } from "@/lib/time-tracking/report";
import { getTimeTrackingSettings } from "@/lib/time-tracking/settings";
import { TeamHoursInputSchema } from "@/lib/validation/redesign";

export async function GET(request: NextRequest): Promise<NextResponse> {
  let user;
  try {
    user = await requireCapabilityUser();
  } catch {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }
  if (!canViewTeamHours(user)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const parsed = TeamHoursInputSchema.safeParse({ weekStart: request.nextUrl.searchParams.get("week") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }
  const week = parsed.data.weekStart;

  const { csv, trialDays } = await teamHoursCsv(db, week, await getTimeTrackingSettings());
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="horario-${week}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Cincel-Trial-Days": String(trialDays),
    },
  });
}
