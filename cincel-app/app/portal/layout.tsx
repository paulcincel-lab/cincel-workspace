import type { ReactNode } from "react";
import { cookies } from "next/headers";

import PortalShell from "@/components/portal/PortalShell";
import { getPortalUser } from "@/lib/portal/session";

/** Portal cookie name (BE §B.2); only its presence is checked here, `getPortalUser()` validates it. */
const PORTAL_SESSION_COOKIE = "cincel_portal_session";

/**
 * Portal layout (FE §3): its own shell, never the staff sidebar or header.
 *
 * Without a portal cookie the shell renders without the client name (the middleware already sends
 * protected `/portal/*` paths to `/portal/login`, which renders here too). With a cookie,
 * `getPortalUser()` validates it, and a stale one just renders the shell without the name: the layout
 * never redirects, so `/portal/acceder?token=…` and `/portal/login?error=…` keep their query string.
 * Protected pages call `requirePortalUser()` themselves, which clears a stale cookie.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const user = cookieStore.get(PORTAL_SESSION_COOKIE)?.value ? await getPortalUser() : null;

  return <PortalShell clientName={user?.name ?? null}>{children}</PortalShell>;
}
