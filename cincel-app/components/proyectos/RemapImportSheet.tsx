"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
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
const REMAP_ACTION_ERROR = "No se pudo completar la acción. Intenta de nuevo.";
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

/** A failed remap result (`{ ok: false, error }`), thrown so the mutation's error branch runs. */
class RemapResultError extends Error {}

/** The copy for a failed preview or apply: the action's own error, or the generic copy when it threw. */
function remapFailureText(err: unknown): string {
  return err instanceof RemapResultError ? remapErrorText(err.message) : REMAP_ACTION_ERROR;
}

/** The sheet state from the remap query. */
function loadStateOf(query: {
  isPending: boolean;
  isError: boolean;
  data: Awaited<ReturnType<typeof getMondayRemapAction>> | undefined;
}): LoadState {
  if (query.isError) return { status: "error", message: REMAP_LOAD_ERROR };
  if (query.isPending || !query.data) return { status: "loading" };
  const result = query.data;
  if (!result.ok) {
    return result.error === "EXPORT_MISSING"
      ? { status: "export_missing" }
      : { status: "error", message: remapErrorText(result.error) };
  }
  return result.remap.boards.every((board) => board.source === null)
    ? { status: "export_missing" }
    : { status: "ready", remap: result.remap };
}

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
  // `changes.etapa` is the remap CLI summary field (scripts/monday/remap.ts, renamed in #1130).
  const c = preview.changes;
  return (
    `${c.etapa} tareas cambian de etapa, ${c.phase} de fase, ${c.space} de espacio, ` +
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
 * "Reacomodar importación" (RD-2): re-sorts an imported project's tasks into etapa / fase / espacio /
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
  // Read on every open (`staleTime: 0`): the stored export may have changed.
  const remapQuery = useQuery({
    queryKey: qk.proyectos.remap(projectId),
    queryFn: () => getMondayRemapAction(projectId),
    enabled: open,
    staleTime: 0,
  });
  const load = loadStateOf(remapQuery);
  const remap = load.status === "ready" ? load.remap : null;
  // The user's target edits and the preview belong to one load: a new read starts them over.
  const loadedAt = remapQuery.dataUpdatedAt;
  const [edits, setEdits] = useState<{ at: number; boards: Record<string, BoardTargets> }>({ at: 0, boards: {} });
  const [previewState, setPreviewState] = useState<{ at: number; preview: MondayRemapPreview } | null>(null);
  const [error, setError] = useState<{ at: number; message: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const targets = useMemo<Record<string, BoardTargets>>(
    () => ({ ...(remap ? initialTargets(remap) : {}), ...(edits.at === loadedAt ? edits.boards : {}) }),
    [remap, edits, loadedAt],
  );
  const preview = previewState && previewState.at === loadedAt ? previewState.preview : null;
  const errorText = error && error.at === loadedAt ? error.message : null;
  const showError = (message: string) => setError({ at: loadedAt, message });

  // Preview only reads: no invalidation.
  const previewMutation = useActionMutation<MondayRemapInput, MondayRemapPreview>(
    async (input) => {
      const result = await previewMondayRemapAction(projectId, input);
      if (!result.ok) throw new RemapResultError(result.error);
      return result.preview;
    },
    { onFormError: showError },
  );
  // Apply moves tasks between etapas, fases and espacios: the whole project and the list.
  const applyMutation = useActionMutation<MondayRemapInput, number>(
    async (input) => {
      const result = await applyMondayRemapAction(projectId, input);
      if (!result.ok) throw new RemapResultError(result.error);
      return result.updated;
    },
    {
      // A refused apply changed nothing, and refetching the project would also reload the remap
      // (`proyectos.remap` sits under `proyectos.detail`) and drop the error with that load.
      invalidate: (_input, updated) => (updated === undefined ? [] : [qk.proyectos.detail(projectId), qk.proyectos.list()]),
      onFormError: showError,
    },
  );
  const pending = previewMutation.isPending ? "preview" : applyMutation.isPending ? "apply" : null;

  const workflowChoices = useMemo(
    () => (remap?.choices.workflows ?? []).map((workflow) => ({ value: workflow.id, label: workflow.name })),
    [remap],
  );

  function updateBoard(boardId: string, update: (current: BoardTargets) => BoardTargets) {
    const current = targets[boardId] ?? { workflowId: null, groupTargets: {} };
    setEdits({ at: loadedAt, boards: { ...(edits.at === loadedAt ? edits.boards : {}), [boardId]: update(current) } });
    setPreviewState(null);
    setError(null);
  }

  function runPreview() {
    if (!remap) return;
    setError(null);
    previewMutation.mutate(remapInput(remap, targets), {
      onSuccess: (next) => setPreviewState({ at: loadedAt, preview: next }),
      onError: (err) => showError(remapFailureText(err)),
    });
  }

  function runApply() {
    if (!remap) return;
    setConfirming(false);
    setError(null);
    applyMutation.mutate(remapInput(remap, targets), {
      onSuccess: (updated) => {
        setPreviewState(null);
        onOpenChange(false);
        onApplied(updated);
      },
      onError: (err) => showError(remapFailureText(err)),
    });
  }

  const changed = preview ? remapChangedTasks(preview) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Reacomodar importación</SheetTitle>
          <SheetDescription>
            Elige a qué etapa, fase o espacio va cada grupo de monday. No cambia estatus, personas, fechas ni
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
                <Button size="sm" variant="outline" onClick={() => void remapQuery.refetch()}>
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
                          <p className="text-sm font-medium text-foreground">Etapa del tablero</p>
                          <ChoiceSelect
                            label={`Etapa del tablero ${board.name}`}
                            value={boardTargets.workflowId}
                            choices={workflowChoices}
                            placeholder="Elige una etapa"
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

          {errorText ? (
            <Alert variant="destructive">
              <AlertDescription>{errorText}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        {remap ? (
          <SheetFooter className="flex-row justify-end gap-2">
            <Button variant="outline" disabled={pending !== null} onClick={runPreview}>
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
                Solo cambian etapa, fase, espacio, proyecto o administración. Estatus, personas, fechas y títulos
                se quedan igual.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={runApply}>Reacomodar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
