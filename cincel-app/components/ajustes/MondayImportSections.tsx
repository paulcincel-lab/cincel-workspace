"use client";

import { History } from "lucide-react";

import { SettingsRow } from "@/components/patterns/SettingsRow";
import { SettingsSection } from "@/components/patterns/SettingsSection";
import { EmptyState } from "@/components/shell/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { RecordTable } from "@/components/widgets/RecordTable";
import {
  MONDAY_IMPORT_RESULT_LABELS,
  formatHistoryCount,
  lastImportCaption,
  mondayImportHistoryTable,
  type MondayImportHistoryEntry,
  type MondayImportResultKey,
} from "@/lib/monday-import/history";

const RESULT_VARIANT: Readonly<Record<MondayImportResultKey, "success" | "outline" | "secondary">> = {
  completada: "success",
  con_avisos: "outline",
  en_curso: "outline",
  deshecha: "secondary",
};

function ResultBadge({ result }: { result: MondayImportResultKey }) {
  return <Badge variant={RESULT_VARIANT[result]}>{MONDAY_IMPORT_RESULT_LABELS[result]}</Badge>;
}

function isResultKey(value: unknown): value is MondayImportResultKey {
  return typeof value === "string" && value in MONDAY_IMPORT_RESULT_LABELS;
}

export type MondayLastImportProps = { entry: MondayImportHistoryEntry };

/** "Última importación" (frame `AjustesMonday`): what the newest batch created. */
export function MondayLastImport({ entry }: MondayLastImportProps) {
  const rows: { label: string; value: number }[] = [
    { label: "Tarjetas importadas", value: entry.cards },
    { label: "Proyectos creados", value: entry.projects },
    { label: "Archivos enlazados", value: entry.files },
    { label: "Errores", value: entry.errors },
  ];
  return (
    <SettingsSection title="Última importación" description={lastImportCaption(entry)}>
      {rows.map((row) => (
        <SettingsRow
          key={row.label}
          label={row.label}
          control={<span className="text-sm font-semibold tabular-nums text-foreground">{formatHistoryCount(row.value)}</span>}
        />
      ))}
    </SettingsSection>
  );
}

export type MondayImportHistoryProps = {
  history: MondayImportHistoryEntry[];
  /** Spanish copy when the history could not be loaded. */
  error: string | null;
};

/** "Historial" (frame `AjustesMonday`): every monday import batch, newest first. */
export function MondayImportHistory({ history, error }: MondayImportHistoryProps) {
  return (
    <SettingsSection
      title="Historial"
      description="Las importaciones aplicadas, de la más reciente a la más antigua."
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : history.length === 0 ? (
        <EmptyState
          icon={History}
          title="Aún no hay importaciones"
          description="Cuando apliques una importación de monday aparecerá aquí."
        />
      ) : (
        <RecordTable
          data={mondayImportHistoryTable(history)}
          renderCell={(columnKey, row) =>
            columnKey === "resultado" && isResultKey(row.resultado) ? <ResultBadge result={row.resultado} /> : undefined
          }
        />
      )}
    </SettingsSection>
  );
}
