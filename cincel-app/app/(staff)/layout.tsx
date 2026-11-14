import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/AppShell";
import { fetchMyTodayAction } from "@/lib/actions/time-tracking-actions";
import { getSessionAccess } from "@/lib/auth/session";
import { LOGIN_ROUTE } from "@/lib/auth/public-routes";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { getStaffPhotoUrl } from "@/lib/profile-photo/photo-url";
import { makeQueryClient } from "@/lib/query/client";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { shellBadgesOptions, shellProjectsOptions } from "@/lib/query/options/shell";
import { prefetch } from "@/lib/query/server";
import { capabilityUserOf, loadShellBadges } from "@/lib/shell/badges";
import { loadShellProjects } from "@/lib/shell/projects";
import type { TodayStatus } from "@/lib/types/redesign";
import type { MyProfile } from "@/lib/types/shell";
import { buildNavModel, type NavModel, type NavSession } from "@/lib/ui/nav";

/**
 * Layout of every staff page (redesign FE §2.3, §5; plan §4.3 Shell). No
 * session → `/login`; an active session renders the page inside `AppShell`.
 *
 * One `Promise.all` loads the photo URL (sha only), the nav model, the
 * caller's day and the badges (`loadShellBadges`: three COUNT reads, no task
 * list). The live parts go into a shell-only query client and reach the
 * browser through one `HydrationBoundary`: `shell.badges`, `me.today` and
 * `me.profile`. The style and `fixedByOrg` come from the appearance store the
 * root layout seeds.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const access = await getSessionAccess();
  if (access.status === "guest" || !access.user) redirect(LOGIN_ROUTE);

  // First access, inactive members and the like render bare: the route guard
  // decides where they go.
  if (access.status !== "active") return <>{children}</>;

  const { user } = access;
  const base = {
    staffId: user.id,
    name: user.name,
    role: user.role ?? "",
    isAdmin: user.access === SYSTEM_ADMIN_ROLE,
  };

  // Its own client, not the request-scoped one, so this boundary carries the shell keys only.
  const qc = makeQueryClient();
  const [photoUrl, nav, today] = await Promise.all([
    loadPhotoUrl(user.id),
    // The nav model never reads the photo.
    loadNav({ ...base, photoUrl: null }),
    loadToday(),
    prefetch(qc, shellBadgesOptions(), () => loadShellBadges(capabilityUserOf(user))),
    prefetch(qc, shellProjectsOptions(), () => loadShellProjects(capabilityUserOf(user))),
  ]);

  const session: NavSession = { ...base, photoUrl };
  const profile: MyProfile = { id: user.id, name: user.name, photoUrl };
  qc.setQueryData(qk.me.profile(), profile);
  if (today) qc.setQueryData(qk.me.today(), today);

  return (
    <Hydrate qc={qc}>
      <AppShell session={session} nav={nav} today={today?.enabled ? today : null}>
        {children}
      </AppShell>
    </Hydrate>
  );
}

const EMPTY_NAV: NavModel = { items: [], etapas: [], footer: [] };

/** A nav failure must not take every page down; the shell renders without items. */
async function loadNav(session: NavSession): Promise<NavModel> {
  try {
    return await buildNavModel(session);
  } catch (error) {
    console.error("[staff-layout] nav model failed", error);
    return EMPTY_NAV;
  }
}

/** The caller's day, or null on a read failure (the sidebar clock then stays hidden). */
async function loadToday(): Promise<TodayStatus | null> {
  try {
    return await fetchMyTodayAction();
  } catch (error) {
    console.error("[staff-layout] today status failed", error);
    return null;
  }
}

/** `/api/staff/<id>/photo?v=<sha8>` (BE §7.2), or null when there is no photo. Sha-only, request-cached read. */
async function loadPhotoUrl(staffId: string): Promise<string | null> {
  try {
    return await getStaffPhotoUrl(staffId);
  } catch (error) {
    console.error("[staff-layout] profile photo lookup failed", error);
    return null;
  }
}
