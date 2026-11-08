import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell, type AppShellProps } from "@/components/shell/AppShell";
import { fetchMyTodayAction } from "@/lib/actions/time-tracking-actions";
import { getSessionAccess } from "@/lib/auth/session";
import { LOGIN_ROUTE } from "@/lib/auth/public-routes";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { db } from "@/lib/db";
import { findStaffPhoto } from "@/lib/repositories/preferences-repository";
import type { TodayStatus } from "@/lib/types/redesign";
import { buildNavModel, type NavModel, type NavSession } from "@/lib/ui/nav";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

/**
 * Layout of every staff page (redesign FE §2.3, §5). No session → `/login`;
 * an active session renders the page inside `AppShell`.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const access = await getSessionAccess();
  if (access.status === "guest" || !access.user) redirect(LOGIN_ROUTE);

  // First access, inactive members and the like render bare: the route guard
  // decides where they go.
  if (access.status !== "active") return <>{children}</>;

  const appearance = await getResolvedAppearance();

  const { user } = access;
  const session: NavSession = {
    staffId: user.id,
    name: user.name,
    role: user.role ?? "",
    isAdmin: user.access === SYSTEM_ADMIN_ROLE,
    photoUrl: await loadPhotoUrl(user.id),
  };
  const [nav, today] = await Promise.all([loadNav(session), loadToday()]);

  return (
    <AppShell appearance={appearance} session={session} nav={nav} today={today}>
      {children}
    </AppShell>
  );
}

const EMPTY_NAV: NavModel = { items: [], tramos: [], footer: [] };

/** A nav failure must not take every page down; the shell renders without items. */
async function loadNav(session: NavSession): Promise<NavModel> {
  try {
    return await buildNavModel(session);
  } catch (error) {
    console.error("[staff-layout] nav model failed", error);
    return EMPTY_NAV;
  }
}

/** Null hides the sidebar clock (time tracking off, the viewer exempt, or a read failure). */
async function loadToday(): Promise<AppShellProps["today"]> {
  let today: TodayStatus;
  try {
    today = await fetchMyTodayAction();
  } catch (error) {
    console.error("[staff-layout] today status failed", error);
    return null;
  }
  return today.enabled ? today : null;
}

/** `/api/staff/<id>/photo?v=<sha8>` (BE §7.2), or null when there is no photo. */
async function loadPhotoUrl(staffId: string): Promise<string | null> {
  try {
    const photo = await findStaffPhoto(db, staffId);
    return photo ? `/api/staff/${staffId}/photo?v=${photo.sha256.slice(0, 8)}` : null;
  } catch (error) {
    console.error("[staff-layout] profile photo lookup failed", error);
    return null;
  }
}
