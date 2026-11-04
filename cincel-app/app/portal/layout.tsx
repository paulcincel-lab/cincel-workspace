import type { ReactNode } from "react";
import { cookies } from "next/headers";

import PortalShell from "@/components/portal/PortalShell";
import { requirePortalUser } from "@/lib/portal/session";

/** Portal cookie name (BE §B.2); only its presence is checked here, `requirePortalUser()` validates it. */
const PORTAL_SESSION_COOKIE = "cincel_portal_session";

/**
 * Portal layout (FE §3): its own shell, never the staff sidebar or header.
 *
 * Without a portal cookie the shell renders without the client name (the middleware already sends
 * protected `/portal/*` paths to `/portal/login`, which renders here too). With a cookie,
 * `requirePortalUser()` validates it; a stale one is dropped through the logout route, so the sign-in
 * page never loops. Pages still call `requirePortalUser()` themselves.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const user = cookieStore.get(PORTAL_SESSION_COOKIE)?.value ? await requirePortalUser() : null;

  return <PortalShell clientName={user?.name ?? null}>{children}</PortalShell>;
}
