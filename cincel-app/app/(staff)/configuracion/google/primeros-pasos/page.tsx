import { redirect } from "next/navigation";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { GoogleSetupWizard } from "@/components/configuracion/GoogleSetupWizard";
import { fetchPositionsAction } from "@/lib/actions/positions-actions";
import { getGoogleHealthAction, listGroupMappingsAction } from "@/lib/actions/workspace-access-actions";
import { getSessionAccess } from "@/lib/auth/session";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { isBootstrapAdminEmail } from "@/lib/onboarding/first-login";
import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

/**
 * First-login Google setup wizard of the bootstrap admin (#671). Administrador only, checked here on the server
 * (and again by every action); any other admin goes to Configuración → Google instead.
 */
export default async function GoogleSetupWizardPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/configuracion/google/primeros-pasos", searchParams);
  const access = await getSessionAccess();
  if (access.status !== "active" || access.user?.access !== SYSTEM_ADMIN_ROLE) redirect("/dashboard");
  if (!isBootstrapAdminEmail(access.user.email)) redirect("/configuracion/google");

  let mappings: GroupMapping[] = [];
  let positions: { id: string; name: string }[] = [];
  let health: GoogleHealth | null = null;
  try {
    const [mappingRows, positionRows] = await Promise.all([listGroupMappingsAction(), fetchPositionsAction()]);
    mappings = mappingRows;
    positions = positionRows
      .filter((position) => position.active || position.googleManaged)
      .map((position) => ({ id: position.id, name: position.name }));
  } catch {
    // Lost the session mid-request: the guard redirects and nothing is loaded.
  }
  try {
    health = await getGoogleHealthAction();
  } catch {
    // The health query failed: Revisión shows its error state and blocks Next.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="min-w-0 flex-1 overflow-y-auto px-4 py-14 md:p-10">
        <Header />
        <GoogleSetupWizard health={health} mappings={mappings} positions={positions} />
      </section>
    </main>
  );
}
