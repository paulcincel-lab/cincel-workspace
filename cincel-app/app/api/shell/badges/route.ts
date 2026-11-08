/**
 * GET /api/shell/badges (plan §4.3 Shell, decision D5): the sidebar counters
 * for the 60 s `qk.shell.badges()` poll, the only GET data route.
 *
 * - The same capability check as the `(staff)` layout: an `active` staff
 *   session. No session (or a portal-only one) → 401; a session without
 *   system access, a first access or an inactive member → 403.
 * - `Cache-Control: private, no-store`: the counts are the caller's own and
 *   never stored by a shared cache.
 * - No side effects: the loader only counts; nothing is written or revalidated.
 */
import { NextResponse } from "next/server";

import { getSessionAccess } from "@/lib/auth/session";
import { capabilityUserOf, loadShellBadges } from "@/lib/shell/badges";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(): Promise<Response> {
  const access = await getSessionAccess();
  if (access.status === "guest") {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401, headers: NO_STORE });
  }
  if (access.status !== "active" || !access.user) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403, headers: NO_STORE });
  }
  const badges = await loadShellBadges(capabilityUserOf(access.user));
  return NextResponse.json(badges, { status: 200, headers: NO_STORE });
}
