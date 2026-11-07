"use client";

import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { BoardGallery } from "@/components/configuracion/monday-import/BoardGallery";
import { BoardMappingSheet } from "@/components/configuracion/monday-import/BoardMappingSheet";
import { JobProgress } from "@/components/configuracion/monday-import/JobProgress";
import type { BoardCard } from "@/lib/monday-import/board-cards";
import { estimatedCallsFor, isJobRunning } from "@/lib/monday-import/wizard-steps";
import type { MappingInput } from "@/scripts/monday/mapping.schema";
import type {
  MondayConnection,
  MondayExportSource,
  MondayImportChoices,
  MondayImportRunState,
  MondayStatusMap,
} from "@/lib/types/monday-import";

export type ExportChoice = { updates: boolean; files: boolean };

/**
 * Paso 2 (#685): the board gallery. Pick the boards (none preselected), export them in the background ("Importar n
 * tableros" in the footer, "Exportar otra vez" here), then open each card to map it; its chip and counts follow the
 * draft live.
 */
export function BoardsStep({
  connection,
  run,
  selectedBoardIds,
  onSelectedChange,
  exportChoice,
  onExportChoiceChange,
  onStartExport,
  isPending,
  mapping,
  onMappingChange,
  cards = [],
  source = null,
  choices = null,
  onBoardOpened,
  onStatusCreated = () => {},
  onStatusMapSaved,
  onStaffCreated = () => {},
}: {
  connection: MondayConnection | null;
  run: MondayImportRunState;
  selectedBoardIds: string[];
  onSelectedChange: (boardIds: string[]) => void;
  exportChoice: ExportChoice;
  onExportChoiceChange: (choice: ExportChoice) => void;
  onStartExport: () => void;
  isPending: boolean;
  mapping: MappingInput | null;
  onMappingChange: (mapping: MappingInput) => void;
  /** The gallery's cards (lib/monday-import/board-cards.ts). */
  cards?: BoardCard[];
  source?: MondayExportSource | null;
  choices?: MondayImportChoices | null;
  /** A card's mapping was opened: it counts as reviewed («listo» once it has no problems). */
  onBoardOpened?: (boardId: string) => void;
  onStatusCreated?: (status: { id: string; name: string; closes: boolean; countsAsCompleted: boolean }) => void;
  /** The firm-wide status map the server saved from a board sheet. */
  onStatusMapSaved?: (statusMap: MondayStatusMap) => void;
  onStaffCreated?: (member: MondayImportChoices["staff"][number]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const exportJob = run.jobs.export;
  const running = isJobRunning(exportJob);
  const applied = Boolean(run.batchId);
  const anyRunning = Object.values(run.jobs).some((job) => isJobRunning(job));
  const selectable = Boolean(connection) && !running && !applied;
  const openCard = cards.find((card) => card.id === openId) ?? null;

  return (
    <div className="space-y-6">
      {!connection && !run.exported && !running ? (
        <Alert>
          <AlertDescription>Vuelve a Conectar monday para elegir y exportar los tableros.</AlertDescription>
        </Alert>
      ) : null}

      {cards.length > 0 ? (
        <BoardGallery
          cards={cards}
          selectedBoardIds={selectedBoardIds}
          onSelectedChange={onSelectedChange}
          selectable={selectable}
          onOpen={(boardId) => {
            setOpenId(boardId);
            onBoardOpened?.(boardId);
          }}
        />
      ) : null}

      {connection && !applied ? (
        <section className="space-y-4" aria-labelledby="monday-boards-export">
          <h3 id="monday-boards-export" className="text-sm font-medium text-foreground">
            Exportación
          </h3>
          <div className="flex flex-wrap gap-6">
            <Label className="flex items-center gap-2">
              <Switch
                checked={exportChoice.updates}
                disabled={running}
                onCheckedChange={(checked) => onExportChoiceChange({ ...exportChoice, updates: checked })}
              />
              Exportar bitácora (updates)
            </Label>
            <Label className="flex items-center gap-2">
              <Switch
                checked={exportChoice.files}
                disabled={running}
                onCheckedChange={(checked) => onExportChoiceChange({ ...exportChoice, files: checked })}
              />
              Exportar archivos
            </Label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {run.exported ? (
              <Button
                variant="outline"
                disabled={isPending || running || selectedBoardIds.length === 0}
                onClick={onStartExport}
              >
                Exportar otra vez
              </Button>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {selectedBoardIds.length} tableros, unas{" "}
              {estimatedCallsFor(connection, selectedBoardIds).toLocaleString("es-MX")} llamadas a monday.
            </p>
          </div>
        </section>
      ) : null}

      {exportJob ? <JobProgress job={exportJob} title="Exportación" /> : null}

      {mapping ? (
        <BoardMappingSheet
          card={openCard}
          mapping={mapping}
          source={source}
          choices={choices}
          runId={run.runId}
          disabled={applied || anyRunning}
          onOpenChange={(open) => {
            if (!open) setOpenId(null);
          }}
          onMappingChange={onMappingChange}
          onStatusCreated={onStatusCreated}
          onStatusMapSaved={onStatusMapSaved}
          onStaffCreated={onStaffCreated}
        />
      ) : null}
    </div>
  );
}
