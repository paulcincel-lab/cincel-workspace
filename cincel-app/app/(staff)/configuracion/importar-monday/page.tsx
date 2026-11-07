import { redirect } from "next/navigation";

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
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

/**
 * Configuración → Importar de monday (#672), also the first-login wizard of Google-signed-in admins. Administrador
 * only and never the bootstrap admin, checked here on the server and again by every action. Opening the page
 * resumes the latest import (or starts one). A full-screen takeover (#685): no sidebar; its ✕ goes back to
 * Configuración and keeps the run.
 */
export default async function ImportarMondayPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/configuracion/importar-monday", searchParams);
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
    <main className="min-h-screen bg-background text-foreground">
      <MondayImportWizard
        initialRun={run}
        initialChoices={choices}
        hasServerToken={hasServerToken}
        loadError={loadError}
      />
    </main>
  );
}
