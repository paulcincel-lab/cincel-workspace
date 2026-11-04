import { redirect } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { GoogleSetupBanner } from "@/components/configuracion/GoogleSetupBanner";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { getFirstLoginState, type FirstLoginState } from "@/lib/onboarding/first-login-server";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  // First-login wizards (#671, #672): sign-in lands here, so this is where an admin is sent to their setup.
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

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="min-w-0 flex-1 overflow-y-auto px-4 py-14 md:p-10">
        <Header variant="profile" />
        {firstLogin?.showGoogleSetupBanner ? <GoogleSetupBanner /> : null}
        <DashboardClient initialProjects={initialProjects} />
      </section>
    </main>
  );
}
