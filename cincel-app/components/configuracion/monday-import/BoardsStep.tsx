"use client";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Label } from "@/components/ui/shadcn/label";
import { Switch } from "@/components/ui/shadcn/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect } from "@/components/configuracion/monday-import/ChoiceSelect";
import { JobProgress } from "@/components/configuracion/monday-import/JobProgress";
import {
  STRATEGY_OPTIONS,
  estimatedCallsFor,
  isJobRunning,
  strategyDescription,
  updateBoard,
} from "@/lib/monday-import/wizard-steps";
import type { BoardStrategy, MappingInput } from "@/scripts/monday/mapping.schema";
import type { MondayConnection, MondayImportRunState } from "@/lib/types/monday-import";

export type ExportChoice = { updates: boolean; files: boolean };

const STRATEGY_CHOICES = STRATEGY_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

/**
 * Paso 2: pick the boards and export them (background), then choose each board's strategy on the draft init
 * prefilled.
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
}) {
  const exportJob = run.jobs.export;
  const running = isJobRunning(exportJob);
  const applied = Boolean(run.batchId);
  const selected = new Set(selectedBoardIds);
  const workspaceName = (id: string | null, name: string | null) => name ?? (id ? `Espacio ${id}` : "Sin espacio");

  function toggle(boardId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(boardId);
    else next.delete(boardId);
    onSelectedChange([...next]);
  }

  return (
    <div className="space-y-6">
      {connection && !applied ? (
        <section className="space-y-4" aria-labelledby="monday-boards-pick">
          <h3 id="monday-boards-pick" className="text-sm font-medium text-foreground">
            Tableros de monday
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="sr-only">Importar</span>
                </TableHead>
                <TableHead>Tablero</TableHead>
                <TableHead>Espacio de trabajo</TableHead>
                <TableHead className="text-right">Elementos</TableHead>
                <TableHead className="text-right">Llamadas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connection.boards.map((board) => (
                <TableRow
                  key={board.id}
                  data-state={selected.has(board.id) ? "selected" : undefined}
                  className={running ? undefined : "cursor-pointer"}
                  onClick={(event) => {
                    // The checkbox and its hidden input toggle themselves; the rest of the row is a bigger target.
                    if (running || (event.target as HTMLElement).closest("[role=checkbox], input")) return;
                    toggle(board.id, !selected.has(board.id));
                  }}
                >
                  <TableCell>
                    {/* Base UI's checkbox root is a <span>: it needs a flex parent to keep its size-4 box. */}
                    <div className="flex items-center">
                      <Checkbox
                        aria-label={`Importar ${board.name}`}
                        checked={selected.has(board.id)}
                        disabled={running}
                        onCheckedChange={(checked) => toggle(board.id, checked === true)}
                      />
                    </div>
                  </TableCell>
                  <TableCell>{board.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {workspaceName(board.workspaceId, board.workspaceName)}
                  </TableCell>
                  <TableCell className="text-right">{board.itemsCount ?? "—"}</TableCell>
                  <TableCell className="text-right">{board.estimatedCalls}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
            <Button disabled={isPending || running || selected.size === 0} onClick={onStartExport}>
              {run.exported ? "Exportar otra vez" : "Exportar tableros"}
            </Button>
            <p className="text-sm text-muted-foreground">
              {selected.size} tableros, unas {estimatedCallsFor(connection, selectedBoardIds).toLocaleString("es-MX")}{" "}
              llamadas a monday.
            </p>
          </div>
        </section>
      ) : null}

      {!connection && !run.exported && !running ? (
        <Alert>
          <AlertDescription>Vuelve a Conectar monday para elegir y exportar los tableros.</AlertDescription>
        </Alert>
      ) : null}

      {exportJob ? <JobProgress job={exportJob} title="Exportación" /> : null}

      {mapping && run.exported && !running ? (
        <section className="space-y-3" aria-labelledby="monday-boards-strategy">
          <h3 id="monday-boards-strategy" className="text-sm font-medium text-foreground">
            Qué será cada tablero en Cincel
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tablero de monday</TableHead>
                <TableHead>En Cincel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mapping.boards.map((board) => (
                <TableRow key={board.mondayBoardId}>
                  <TableCell className="align-top">{board.name}</TableCell>
                  <TableCell className="space-y-1">
                    <ChoiceSelect
                      label={`Estrategia de ${board.name}`}
                      value={board.strategy}
                      choices={STRATEGY_CHOICES}
                      disabled={applied}
                      onChange={(value) =>
                        onMappingChange(
                          updateBoard(mapping, board.mondayBoardId, (current) => ({
                            ...current,
                            strategy: value as BoardStrategy,
                          })),
                        )
                      }
                    />
                    <p className="whitespace-normal text-xs text-muted-foreground">
                      {strategyDescription(board.strategy)}
                    </p>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}
