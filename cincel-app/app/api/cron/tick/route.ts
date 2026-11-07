/**
 * POST (and GET) /api/cron/tick (redesign BE §13): host cron every minute with
 * `Authorization: Bearer ${CRON_SECRET}` (constant-time; 401 wrong, 503 unset),
 * lease `tick` (204 when held), runs the registered jobs and answers
 * `200 { ran, skipped }`.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import "@/lib/cron/jobs";
import { runTick } from "@/lib/cron/tick";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Compares the two secrets in constant time (both hashed first, so length does not leak). */
function sameSecret(given: string, expected: string): boolean {
  const left = createHash("sha256").update(given, "utf8").digest();
  const right = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(left, right);
}

function bearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

async function handle(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "DISABLED" }, { status: 503 });
  }
  const token = bearerToken(request);
  if (token === null || !sameSecret(token, secret)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const report = await runTick(new Date());
  if (!report.acquired) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json({ ran: report.ran, skipped: report.skipped }, { status: 200 });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handle(request);
}
