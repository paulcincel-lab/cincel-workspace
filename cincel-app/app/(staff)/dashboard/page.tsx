import { redirect } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { GoogleSetupBanner } from "@/components/configuracion/GoogleSetupBanner";
import { RedesignOptInBanner } from "@/components/shell/RedesignOptIn";
import { fetchOrgAppearanceAction } from "@/lib/actions/org-appearance-actions";
import { IMPLEMENTED as PREFERENCES_IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { getSessionAccess } from "@/lib/auth/session";
import { getFirstLoginState, type FirstLoginState } from "@/lib/onboarding/first-login-server";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";
import { redesignOptInVisibility, type RedesignOptInVisibility } from "@/lib/ui/redesign-opt-in";
import { DashboardClient } from "./DashboardClient";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function DashboardPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/dashboard", searchParams);
  // First-login wizards (issues 671 and 672): sign-in lands here, so this is where an admin is sent to their setup.
  let firstLogin: FirstLoginState | null = null;
  try {
    firstLogin = await getFirstLoginState();
  } catch {
    // No session or the query failed: show the dashboard as usual.
  }
  if (firstLogin?.route) redirect(firstLogin.route);

  let initialProjects: Awaited<ReturnType<typeof fetchProjectsAction>> = [];
  try {
    initialProjects = await fetchProjectsAction();
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  // Redesign opt-in banner (FE §2.3): only for flag-off users while the org allows the new design.
  let optIn: { userId: string; visibility: RedesignOptInVisibility } | null = null;
  if (PREFERENCES_IMPLEMENTED.updateMyPreferencesAction) {
    try {
      const [session, org, appearance] = await Promise.all([
        getSessionAccess(),
        fetchOrgAppearanceAction(),
        getResolvedAppearance(),
      ]);
      if (session.user) {
        optIn = {
          userId: session.user.id,
          visibility: redesignOptInVisibility({
            implemented: true,
            redesignEnabled: appearance.redesignEnabled,
            redesignAvailable: org.redesignAvailable,
          }),
        };
      }
    } catch {
      // Unknown state: no banner.
    }
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="min-w-0 flex-1 overflow-y-auto px-4 py-14 md:p-10">
        <Header variant="profile" />
        {firstLogin?.showGoogleSetupBanner ? <GoogleSetupBanner /> : null}
        {optIn ? <RedesignOptInBanner userId={optIn.userId} visibility={optIn.visibility} /> : null}
        <DashboardClient initialProjects={initialProjects} />
      </section>
    </main>
  );
}
