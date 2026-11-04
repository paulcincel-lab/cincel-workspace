"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/shadcn/table";
import { countLabel, PREVIEW_COUNT_LABELS, STRATEGY_OPTIONS } from "@/lib/monday-import/wizard-steps";
import type {
  MondayImportStep,
  MondayPreview,
  MondayPreviewCounts,
  MondayPreviewIssue,
  MondayPreviewSample,
} from "@/lib/types/monday-import";

const ENTITY_LABELS: Record<MondayPreviewSample["entity"], string> = {
  proyecto: "Proyecto",
  tarea: "Tarea",
  contacto: "Contacto",
};

function Counts({ counts }: { counts: MondayPreviewCounts }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {PREVIEW_COUNT_LABELS.map(([key, label]) => (
        <div key={key} className="rounded-xl border border-border p-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-lg font-medium text-foreground">{counts[key].toLocaleString("es-MX")}</dd>
        </div>
      ))}
    </dl>
  );
}

function sampleDetails(sample: MondayPreviewSample): string {
  const c = sample.cincel;
  const parts = [
    c.project ? `Proyecto: ${c.project}` : null,
    sample.entity === "proyecto" ? (c.workflow ? `Workflow: ${c.workflow}` : "Sin workflow") : null,
    sample.entity === "proyecto"
      ? c.phase
        ? `Fases del proyecto: ${c.phase}`
        : "Sin fases: los grupos quedan solo como etiqueta de las tareas"
      : c.phase
        ? `Fase: ${c.phase}`
        : null,
    c.customStatus ?? c.status ? `Estatus: ${c.customStatus ?? c.status}` : null,
    c.priority ? `Prioridad: ${c.priority}` : null,
    c.manager ? `Responsable: ${c.manager}` : null,
    c.commitmentDate ? `Compromiso: ${c.commitmentDate}` : null,
    c.deliveryDate ? `Entrega: ${c.deliveryDate}` : null,
    c.kind === "workflow" ? "Tarea de workflow" : null,
    c.template ? "De plantilla" : null,
    c.checklistItems ? `${c.checklistItems} de checklist` : null,
    c.tasks ? countLabel(c.tasks, "tarea", "tareas") : null,
    c.childTasks ? countLabel(c.childTasks, "subtarea", "subtareas") : null,
    c.comments ? countLabel(c.comments, "comentario", "comentarios") : null,
    c.files ? countLabel(c.files, "archivo", "archivos") : null,
    c.contactType ? `Tipo: ${c.contactType}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** One problem: the board and item it is about, the Spanish message and a "Corregir" link to where it gets fixed. */
function IssueItem({
  issue,
  isPending,
  onFix,
}: {
  issue: MondayPreviewIssue;
  isPending: boolean;
  onFix: (step: MondayImportStep, boardId: string | null) => void;
}) {
  const where = [issue.boardName, issue.itemName].filter(Boolean).join(" › ");
  return (
    <li className="break-words">
      {where ? <span className="font-medium">{where}: </span> : null}
      {issue.message}{" "}
      <Button variant="link" size="sm" disabled={isPending} onClick={() => onFix(issue.fixStep, issue.boardId)}>
        Corregir
      </Button>
    </li>
  );
}

/** Paso 6: the plan dry run. Next (Importar) stays disabled while a blocking issue is left. */
export function PreviewStep({
  preview,
  error,
  isPending,
  onRefresh,
  onFix,
}: {
  preview: MondayPreview | null;
  error: string;
  isPending: boolean;
  onRefresh: () => void;
  /** Opens the step where an issue gets fixed, on its board. */
  onFix: (step: MondayImportStep, boardId: string | null) => void;
}) {
  const blocking = preview?.issues.filter((issue) => issue.blocking) ?? [];
  const warnings = preview?.issues.filter((issue) => !issue.blocking) ?? [];

  return (
    <div className="space-y-6">
      <Button variant="outline" disabled={isPending} onClick={onRefresh}>
        {isPending ? "Calculando…" : "Volver a calcular"}
      </Button>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {preview ? (
        <>
          <Counts counts={preview.totals} />

          {blocking.length > 0 ? (
            <Alert variant="destructive">
              <AlertTitle>Corrige esto antes de importar</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {blocking.map((issue, index) => (
                    <IssueItem key={`${issue.code}-${index}`} issue={issue} isPending={isPending} onFix={onFix} />
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {warnings.length > 0 ? (
            <Alert>
              <AlertTitle>Avisos</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {warnings.map((issue, index) => (
                    <IssueItem key={`${issue.code}-${index}`} issue={issue} isPending={isPending} onFix={onFix} />
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}

          {preview.boards.map((board) => (
            <section key={board.boardId} className="space-y-3" aria-labelledby={`preview-${board.boardId}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 id={`preview-${board.boardId}`} className="text-sm font-medium text-foreground">
                  {board.name}
                </h3>
                <Badge variant="outline">
                  {STRATEGY_OPTIONS.find((option) => option.value === board.strategy)?.label ?? board.strategy}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {countLabel(board.counts.proyectos, "proyecto", "proyectos")}, {countLabel(board.counts.tareas, "tarea", "tareas")},{" "}
                {countLabel(board.counts.contactos, "contacto", "contactos")}.
              </p>
              {board.samples.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Elemento de monday</TableHead>
                      <TableHead>En Cincel</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {board.samples.map((sample) => (
                      <TableRow key={sample.mondayItemId}>
                        <TableCell className="align-top">
                          <span className="text-foreground">{sample.mondayName}</span>
                          {sample.groupTitle ? (
                            <span className="block text-xs text-muted-foreground">{sample.groupTitle}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                          <span className="text-foreground">
                            {ENTITY_LABELS[sample.entity]}: {sample.cincel.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">{sampleDetails(sample)}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
            </section>
          ))}
        </>
      ) : null}
    </div>
  );
}
