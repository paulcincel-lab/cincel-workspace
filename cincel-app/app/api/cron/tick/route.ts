/**
 * POST (and GET) /api/cron/tick (redesign BE §13): host cron every minute with
 * `Authorization: Bearer ${CRON_SECRET}` (constant-time; 401 wrong, 503 unset),
 * lease `tick` (204 when held), runs the registered jobs and answers
 * `200 { ran, skipped }`.
 *
 * Contract stub.
 */
import type { NextRequest, NextResponse } from "next/server";

import { notImplemented } from "@/lib/stubs";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return notImplemented("POST /api/cron/tick", request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return notImplemented("GET /api/cron/tick", request);
}
