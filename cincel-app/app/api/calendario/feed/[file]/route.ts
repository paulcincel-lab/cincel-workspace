import { type NextRequest, NextResponse } from "next/server";

import { findStaffByCalendarFeedToken } from "@/lib/repositories/calendar-feed-repository";
import { listFeedMeetings } from "@/lib/repositories/calendario-events-range";
import { listMyTasks } from "@/lib/repositories/tasks-repository";
import { staffViewerScope } from "@/lib/repositories/viewer-scope-repository";
import { buildCalendarEvents } from "@/lib/calendar/calendar-service";
import { buildIcs } from "@/lib/calendar/ics";

/**
 * GET /api/calendario/feed/<token>.ics — the caller's subscribable calendar.
 *
 * Deliberately not session-gated: Google Calendar polls this URL with no
 * cookie, so the secret token in the path is the credential (only its hash is
 * stored; see lib/repositories/calendar-feed-repository.ts). Every failure is
 * the same 404 so a wrong token reveals nothing.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
): Promise<NextResponse> {
  const { file } = await params;
  const token = file.replace(/\.ics$/i, "");

  const staff = /^[a-f0-9]{48}$/.test(token) ? await findStaffByCalendarFeedToken(token) : null;
  if (!staff) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Admin tasks only in an administrator's own feed (project flow BE §8.8).
  const tasks = await listMyTasks(staff.id, { archived: false }, await staffViewerScope(staff.id));
  // Confirmed Cincel meetings of the person (organizer or attendee), from 90 days back; cached Google events stay out.
  const meetings = await listFeedMeetings(staff.id, new Date(Date.now() - 90 * 86_400_000));
  const ics = buildIcs(buildCalendarEvents(tasks), {
    meetings,
    baseUrl: request.nextUrl.origin,
    calendarName: `Cincel — ${staff.name}`,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="cincel.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
