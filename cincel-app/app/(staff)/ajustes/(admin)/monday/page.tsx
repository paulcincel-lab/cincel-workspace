import { redirect } from "next/navigation";

import { MondayImportHistory, MondayLastImport } from "@/components/ajustes/MondayImportSections";
import { MondayImportWizard } from "@/components/configuracion/monday-import/MondayImportWizard";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import {
  getMondayImportChoicesAction,
  getMondayImportHistoryAction,
  getMondayImportStatusAction,
  openMondayImportRunAction,
} from "@/lib/actions/monday-import-actions";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import type { MondayImportHistoryEntry } from "@/lib/monday-import/history";
import { isBootstrapAdminEmail } from "@/lib/onboarding/first-login";
import type { MondayImportChoices, MondayImportRunState } from "@/lib/types/monday-import";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const HISTORY_ERROR = "No se pudo cargar el historial de importaciones. Recarga la página.";

/**
 * Ajustes › Importar de monday (redesign FE §3.8, frame `AjustesMonday`): the
 * existing import wizard (#672) between "Última importación" and "Historial".
 * Administrador only and never the bootstrap admin (today's rule), checked by
 * the segment layout, here and again by every action. Opening the page resumes
 * the latest import (or starts one), as before. New-only route: with the
 * redesign off it redirects to the legacy `/configuracion/importar-monday`.
 */
export default async function AjustesMondayPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await redirectIfRedesignOff("/ajustes/monday", searchParams ? await searchParams : undefined);
  const user = await requireSettingsAdminPage();
  if (isBootstrapAdminEmail(user.email)) redirect("/ajustes/permisos");

  let run: MondayImportRunState | null = null;
  let choices: MondayImportChoices | null = null;
  let hasServerToken = false;
  let loadError: string | null = null;
  let history: MondayImportHistoryEntry[] = [];
  let historyError: string | null = null;
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
  try {
    const result = await getMondayImportHistoryAction();
    if (result.ok) history = result.history;
    else historyError = result.error;
  } catch {
    historyError = HISTORY_ERROR;
  }

  const latest = history[0] ?? null;

  return (
    <>
      {latest ? <MondayLastImport entry={latest} /> : null}
      <SettingsSection title="Importar de monday" description="Trae tableros, grupos y personas de monday a Cincel.">
        <MondayImportWizard
          initialRun={run}
          initialChoices={choices}
          hasServerToken={hasServerToken}
          loadError={loadError}
        />
      </SettingsSection>
      {history.length > 0 || historyError ? <MondayImportHistory history={history} error={historyError} /> : null}
    </>
  );
}
