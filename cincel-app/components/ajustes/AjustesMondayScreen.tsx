"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";

import { MondayImportHistory, MondayLastImport } from "@/components/ajustes/MondayImportSections";
import { MondayImportWizard } from "@/components/configuracion/monday-import/MondayImportWizard";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { ajustesMondayOptions } from "@/lib/query/options/ajustes";
import { mondayHistoryOptions } from "@/lib/query/options/monday";

/**
 * Ajustes › Importar de monday (redesign FE §3.8, frame `AjustesMonday`): "Última importación", the import
 * wizard and "Historial". Reads `ajustes.page('monday')` (prefetched by the page) and `monday.history()`
 * (seeded from it, refetched when an apply or a rollback finishes).
 */
export function AjustesMondayScreen() {
  const { data } = useSuspenseQuery(ajustesMondayOptions());
  // Seeded only when the page read the history; after a page error the next page fetch seeds it.
  const historyQuery = useQuery({ ...mondayHistoryOptions(), enabled: !data.errors.history });
  const history = historyQuery.data ?? data.history;
  const historyError = historyQuery.data ? null : data.errors.history;
  const latest = history[0] ?? null;

  return (
    <>
      {latest ? <MondayLastImport entry={latest} /> : null}
      <SettingsSection title="Importar de monday" description="Trae tableros, grupos y personas de monday a Cincel.">
        <MondayImportWizard
          latestRun={data.run}
          hasServerToken={data.status.hasServerToken}
          loadError={data.errors.load}
        />
      </SettingsSection>
      {history.length > 0 || historyError ? <MondayImportHistory history={history} error={historyError} /> : null}
    </>
  );
}
