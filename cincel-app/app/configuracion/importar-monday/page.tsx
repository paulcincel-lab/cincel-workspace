import { redirect } from "next/navigation";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { MondayImportWizard } from "@/components/configuracion/monday-import/MondayImportWizard";
import {
  getMondayImportChoicesAction,
  getMondayImportStatusAction,
  openMondayImportRunAction,
} from "@/lib/actions/monday-import-actions";
import { getSessionAccess } from "@/lib/auth/session";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { isBootstrapAdminEmail } from "@/lib/onboarding/first-login";
import type { MondayImportChoices, MondayImportRunState } from "@/lib/types/monday-import";

/**
 * Configuración → Importar de monday (#672), also the first-login wizard of Google-signed-in admins. Administrador
 * only and never the bootstrap admin, checked here on the server and again by every action. Opening the page
 * resumes the latest import (or starts one).
 */
export default async function ImportarMondayPage() {
  const access = await getSessionAccess();
  if (access.status !== "active" || access.user?.access !== SYSTEM_ADMIN_ROLE) redirect("/dashboard");
  if (isBootstrapAdminEmail(access.user.email)) redirect("/configuracion/permisos");

  let run: MondayImportRunState | null = null;
  let choices: MondayImportChoices | null = null;
  let hasServerToken = false;
  let loadError: string | null = null;
  try {
    const [status, opened, choiceResult] = await Promise.all([
      getMondayImportStatusAction(),
      openMondayImportRunAction(false),
      getMondayImportChoicesAction(),
    ]);
    if (status.ok) hasServerToken = status.hasServerToken;
    if (opened.ok) run = opened.run;
    else loadError = opened.error;
    if (choiceResult.ok) choices = choiceResult.choices;
    else loadError ??= choiceResult.error;
  } catch {
    loadError = "No se pudo cargar la importación. Recarga la página.";
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="min-w-0 flex-1 overflow-y-auto px-4 py-14 md:p-10">
        <Header />
        <MondayImportWizard
          initialRun={run}
          initialChoices={choices}
          hasServerToken={hasServerToken}
          loadError={loadError}
        />
      </section>
    </main>
  );
}
