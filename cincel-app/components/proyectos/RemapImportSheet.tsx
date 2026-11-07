"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/shadcn/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/shadcn/sheet";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { ChoiceSelect } from "@/components/configuracion/monday-import/ChoiceSelect";
import { GroupTargetsTable } from "@/components/configuracion/monday-import/GroupTargetsTable";
import {
  applyMondayRemapAction,
  getMondayRemapAction,
  previewMondayRemapAction,
} from "@/lib/actions/monday-import-actions";
import { canSeeAdminData } from "@/lib/auth/permissions";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { ProjectDetail } from "@/lib/types/core";
import type {
  MondayPreviewIssue,
  MondayRemapBoard,
  MondayRemapInput,
  MondayRemapPreview,
  MondayRemapState,
  ProjectFlowGroupTarget,
} from "@/lib/types/monday-import";

export const REMAP_LOAD_ERROR = "No se pudo cargar la importación de este proyecto.";
export const REMAP_BOARD_MISSING =
  "Este tablero ya no está en la exportación guardada; no se puede reacomodar.";
export const REMAP_EXPORT_GONE =
  "Los archivos de la exportación de monday de este proyecto ya no están en el servidor. Vuelve a exportar sus tableros en Importar de monday para poder reacomodarlo.";

const ERROR_COPY: Record<string, string> = {
  NOT_IMPORTED: "Este proyecto no viene de una importación de monday.",
  EXPORT_MISSING:
    "Ya no están los archivos de la exportación de monday de este proyecto. Vuelve a exportar el tablero para reacomodarlo.",
  FORBIDDEN: "No tienes permiso para realizar esta acción.",
};

/** "Reacomodar importación" shows for administrators on projects that came from monday only. */
export function canRemapImport(
  user: AuthenticatedUser | null | undefined,
  project: Pick<ProjectDetail, "mondayImport"> | null | undefined,
): boolean {
  return canSeeAdminData(user) && Boolean(project?.mondayImport);
}

/** The action errors come as a code or as Spanish copy; codes get their copy. */
export function remapErrorText(error: string): string {
  return ERROR_COPY[error] ?? ERROR_COPY[error.split(":")[0]] ?? error;
}

type BoardTargets = { workflowId: string | null; groupTargets: Record<string, ProjectFlowGroupTarget> };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "export_missing" }
  | { status: "ready"; remap: MondayRemapState };

/** The remap board as the wizard's board draft, so the wizard's `GroupTargetsTable` can edit it. */
function boardDraft(board: MondayRemapBoard, targets: BoardTargets): BoardDraft {
  return {
    mondayBoardId: board.boardId,
    name: board.name,
    strategy: "board_as_project",
    workflowId: targets.workflowId,
    columns: {},
    groupTargets: targets.groupTargets,
  } as unknown as BoardDraft;
}

function fromDraft(draft: BoardDraft): BoardTargets {
  const raw = draft as unknown as { workflowId?: string | null; groupTargets?: Record<string, ProjectFlowGroupTarget> };
  return { workflowId: raw.workflowId ?? null, groupTargets: { ...(raw.groupTargets ?? {}) } };
}

function initialTargets(remap: MondayRemapState): Record<string, BoardTargets> {
  return Object.fromEntries(
    remap.boards.map((board) => [board.boardId, { workflowId: board.workflowId, groupTargets: { ...board.groupTargets } }]),
  );
}

/** Only boards still in the stored export go in the input. */
function remapInput(remap: MondayRemapState, targets: Record<string, BoardTargets>): MondayRemapInput {
  return remap.boards
    .filter((board) => board.source !== null)
    .map((board) => ({
      boardId: board.boardId,
      workflowId: targets[board.boardId]?.workflowId ?? null,
      groupTargets: targets[board.boardId]?.groupTargets ?? {},
    }));
}

/** Tasks the remap moves: everything but the unchanged ones. */
export function remapChangedTasks(preview: MondayRemapPreview): number {
  return Math.max(0, preview.tasks - preview.changes.unchanged);
}

export function remapCountsText(preview: MondayRemapPreview): string {
  const c = preview.changes;
  return (
    `${c.tramo} tareas cambian de tramo, ${c.phase} de fase, ${c.space} de espacio, ` +
    `${c.admin} pasan a administración, ${c.unchanged} sin cambios, ${c.phaseUnresolved} sin fase · revisar`
  );
}

function groupIssues(issues: MondayPreviewIssue[]): Array<{ key: string; title: string; items: MondayPreviewIssue[] }> {
  const groups = new Map<string, { key: string; title: string; items: MondayPreviewIssue[] }>();
  for (const issue of issues) {
    const key = `${issue.blocking ? "b" : "w"}:${issue.code}`;
    const group = groups.get(key) ?? { key, title: issue.message, items: [] };
    group.items.push(issue);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    title: group.items.length > 1 ? `${group.title} (${group.items.length})` : group.title,
  }));
}

function PreviewResult({ preview }: { preview: MondayRemapPreview }) {
  const issueGroups = groupIssues(preview.issues);
  return (
    <section className="space-y-3" aria-label="Vista previa del reacomodo">
      <p className="text-sm text-foreground">{remapCountsText(preview)}</p>
      {preview.changes.otherProject > 0 ? (
        <p className="text-sm text-muted-foreground">{preview.changes.otherProject} tareas pasan a otro proyecto.</p>
      ) : null}
      {preview.samples.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarea</TableHead>
              <TableHead>Antes</TableHead>
              <TableHead>Después</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.samples.slice(0, 10).map((sample) => (
              <TableRow key={sample.taskId}>
                <TableCell className="whitespace-normal">{sample.title}</TableCell>
                <TableCell className="whitespace-normal">{sample.before}</TableCell>
                <TableCell className="whitespace-normal">{sample.after}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {issueGroups.length > 0 ? (
        <Accordion>
          {issueGroups.map((group) => (
            <AccordionItem key={group.key} value={group.key}>
              <AccordionTrigger>{group.title}</AccordionTrigger>
              <AccordionContent>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {group.items.map((issue, index) => (
                    <li key={`${group.key}-${index}`}>
                      {[issue.boardName, issue.itemName].filter(Boolean).join(" › ") || issue.message}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : null}
    </section>
  );
}

/**
 * "Reacomodar importación" (RD-2): re-sorts an imported project's tasks into tramo / fase / espacio /
 * project / admin from its monday groups. Preview first; any target change clears the preview.
 */
export function RemapImportSheet({
  projectId,
  open,
  onOpenChange,
  onApplied,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After a successful apply, with the number of updated tasks; the sheet closes itself. */
  onApplied: (updated: number) => void;
}) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [targets, setTargets] = useState<Record<string, BoardTargets>>({});
  const [preview, setPreview] = useState<MondayRemapPreview | null>(null);
  const [pending, setPending] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fetchState = useCallback(async () => {
    setLoad({ status: "loading" });
    setPreview(null);
    setError(null);
    try {
      const result = await getMondayRemapAction(projectId);
      if (!result.ok) {
        if (result.error === "EXPORT_MISSING") setLoad({ status: "export_missing" });
        else setLoad({ status: "error", message: remapErrorText(result.error) });
        return;
      }
      setTargets(initialTargets(result.remap));
      setLoad(
        result.remap.boards.every((board) => board.source === null)
          ? { status: "export_missing" }
          : { status: "ready", remap: result.remap },
      );
    } catch {
      setLoad({ status: "error", message: REMAP_LOAD_ERROR });
    }
  }, [projectId]);

  useEffect(() => {
    // Load when the sheet opens; the fetch sets state once it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void fetchState();
  }, [open, fetchState]);

  const remap = load.status === "ready" ? load.remap : null;
  const workflowChoices = useMemo(
    () => (remap?.choices.workflows ?? []).map((workflow) => ({ value: workflow.id, label: workflow.name })),
    [remap],
  );

  function updateBoard(boardId: string, update: (current: BoardTargets) => BoardTargets) {
    setTargets((current) => ({
      ...current,
      [boardId]: update(current[boardId] ?? { workflowId: null, groupTargets: {} }),
    }));
    setPreview(null);
    setError(null);
  }

  async function runPreview() {
    if (!remap) return;
    setPending("preview");
    setError(null);
    try {
      const result = await previewMondayRemapAction(projectId, remapInput(remap, targets));
      if (result.ok) setPreview(result.preview);
      else setError(remapErrorText(result.error));
    } catch {
      setError("No se pudo completar la acción. Intenta de nuevo.");
    } finally {
      setPending(null);
    }
  }

  async function runApply() {
    if (!remap) return;
    setConfirming(false);
    setPending("apply");
    setError(null);
    try {
      const result = await applyMondayRemapAction(projectId, remapInput(remap, targets));
      if (result.ok) {
        setPreview(null);
        onOpenChange(false);
        onApplied(result.updated);
      } else {
        setError(remapErrorText(result.error));
      }
    } catch {
      setError("No se pudo completar la acción. Intenta de nuevo.");
    } finally {
      setPending(null);
    }
  }

  const changed = preview ? remapChangedTasks(preview) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Reacomodar importación</SheetTitle>
          <SheetDescription>
            Elige a qué tramo, fase o espacio va cada grupo de monday. No cambia estatus, personas, fechas ni
            títulos, y no borra tareas.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4">
          {load.status === "loading" ? (
            <div className="space-y-2" aria-label="Cargando importación">
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-8 w-full" />
              ))}
            </div>
          ) : null}

          {load.status === "error" ? (
            <Alert variant="destructive">
              <AlertTitle>{REMAP_LOAD_ERROR}</AlertTitle>
              <AlertDescription className="space-y-2">
                {load.message !== REMAP_LOAD_ERROR ? <p>{load.message}</p> : null}
                <Button size="sm" variant="outline" onClick={() => void fetchState()}>
                  Reintentar
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {load.status === "export_missing" ? (
            <Alert variant="destructive">
              <AlertDescription>{REMAP_EXPORT_GONE}</AlertDescription>
            </Alert>
          ) : null}

          {remap
            ? remap.boards.map((board) => {
                const boardTargets = targets[board.boardId] ?? { workflowId: board.workflowId, groupTargets: {} };
                return (
                  <section key={board.boardId} className="space-y-3" aria-label={board.name}>
                    <h3 className="text-base font-semibold text-foreground">{board.name}</h3>
                    {board.source === null ? (
                      <p className="text-sm text-muted-foreground">{REMAP_BOARD_MISSING}</p>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">Tramo del tablero</p>
                          <ChoiceSelect
                            label={`Tramo del tablero ${board.name}`}
                            value={boardTargets.workflowId}
                            choices={workflowChoices}
                            placeholder="Elige un tramo"
                            onChange={(workflowId) => updateBoard(board.boardId, (current) => ({ ...current, workflowId }))}
                          />
                        </div>
                        <GroupTargetsTable
                          board={boardDraft(board, boardTargets)}
                          source={board.source}
                          choices={remap.choices}
                          clientChoices={[{ value: "none", label: "Sin cliente" }]}
                          onBoardChange={(update) =>
                            updateBoard(board.boardId, (current) => fromDraft(update(boardDraft(board, current))))
                          }
                        />
                      </>
                    )}
                  </section>
                );
              })
            : null}

          {remap && preview ? <PreviewResult preview={preview} /> : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        {remap ? (
          <SheetFooter className="flex-row justify-end gap-2">
            <Button variant="outline" disabled={pending !== null} onClick={() => void runPreview()}>
              {pending === "preview" ? "Calculando…" : "Vista previa"}
            </Button>
            <Button disabled={!preview || pending !== null} onClick={() => setConfirming(true)}>
              {pending === "apply" ? "Aplicando…" : "Aplicar"}
            </Button>
          </SheetFooter>
        ) : null}

        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                ¿Reacomodar {changed} tareas de {remap?.project.name ?? "este proyecto"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Solo cambian tramo, fase, espacio, proyecto o administración. Estatus, personas, fechas y títulos
                se quedan igual.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void runApply()}>Reacomodar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
