"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Progress } from "@/components/ui/shadcn/progress";
import { JobProgress } from "@/components/configuracion/monday-import/JobProgress";
import { isJobRunning, jobPercent, rollbackBlockerText } from "@/lib/monday-import/wizard-steps";
import type { MondayImportedProject, MondayImportRunState, MondayRollbackCheck } from "@/lib/types/monday-import";

/**
 * One card per imported board (#685): its progress while apply runs, then the links to the projects it created, or
 * why it failed.
 */
function BoardImportCards({
  boards,
  run,
  projects,
}: {
  boards: { id: string; name: string }[];
  run: MondayImportRunState;
  projects: MondayImportedProject[] | null;
}) {
  const apply = run.jobs.apply;
  const running = isJobRunning(apply);
  const percent = jobPercent(apply);
  const failed = apply && (apply.status === "failed" || apply.status === "interrupted") && !run.batchStatus;
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Tableros importados">
      {boards.map((board) => {
        const own = (projects ?? []).filter((project) => project.boardId === board.id);
        return (
          <li key={board.id}>
            <Card
              role="group"
              aria-label={board.name}
              size="sm"
              className="h-full motion-safe:animate-in motion-safe:fade-in-0"
            >
              <CardHeader>
                <CardTitle className="break-words">{board.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2" aria-live="polite">
                {running ? (
                  <>
                    <Progress value={percent} aria-label={`Importando ${board.name}`} />
                    <p className="text-muted-foreground">{apply?.progress.label ?? "Importando…"}</p>
                  </>
                ) : run.batchStatus === "rolled_back" ? (
                  <p className="text-muted-foreground">Deshecho.</p>
                ) : run.batchStatus === "applied" ? (
                  projects === null ? (
                    <p className="text-muted-foreground">Cargando…</p>
                  ) : own.length > 0 ? (
                    <ul className="space-y-1">
                      {own.map((project) => (
                        <li key={project.id}>
                          <Link href={project.href} className="underline underline-offset-4">
                            {project.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">Importado, sin proyectos (contactos u otros registros).</p>
                  )
                ) : failed ? (
                  <p className="text-destructive">{apply?.error ?? "No se pudo importar. Revisa el registro."}</p>
                ) : run.batchStatus === "applying" ? (
                  <p className="text-muted-foreground">Faltan archivos por subir. Reintenta la importación.</p>
                ) : (
                  <p className="text-muted-foreground">Listo para importar.</p>
                )}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

/** Paso 7: apply in the background, links to the created projects, and "Deshacer importación" with its blockers. */
export function ImportStep({
  run,
  projects,
  rollbackCheck,
  isPending,
  error,
  onStartApply,
  onStartRollback,
  onFinish,
  boards = [],
}: {
  run: MondayImportRunState;
  /** null while the result is loading. */
  projects: MondayImportedProject[] | null;
  rollbackCheck: MondayRollbackCheck | null;
  isPending: boolean;
  error: string;
  onStartApply: () => void;
  onStartRollback: () => void;
  onFinish: () => void;
  /** The boards being imported (not skipped), one card each (#685). */
  boards?: { id: string; name: string }[];
}) {
  const [confirming, setConfirming] = useState(false);
  const apply = run.jobs.apply;
  const rollback = run.jobs.rollback;
  const busy = isPending || isJobRunning(apply) || isJobRunning(rollback);
  const applied = run.batchStatus === "applied";
  const rolledBack = run.batchStatus === "rolled_back";
  const canRetryApply = !applied && !rolledBack && (!apply || apply.status !== "running");
  const loadingResult = applied && projects === null;
  const onCards = new Set(boards.map((board) => board.id));
  // Projects without a card (no board in their import ref) keep their link in the summary.
  const loose = (projects ?? []).filter((project) => !project.boardId || !onCards.has(project.boardId));

  return (
    <div className="space-y-6">
      {canRetryApply ? (
        <div className="space-y-2">
          <Button disabled={busy} onClick={onStartApply}>
            {apply ? "Reintentar importación" : "Importar a Cincel"}
          </Button>
          {apply && apply.status !== "succeeded" ? (
            <p className="text-sm text-muted-foreground">Al reintentar, la importación sigue donde se quedó.</p>
          ) : null}
        </div>
      ) : null}

      {boards.length > 0 ? <BoardImportCards boards={boards} run={run} projects={projects} /> : null}

      {apply ? <JobProgress job={apply} title="Importación" /> : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {applied ? (
        <Alert>
          <Check aria-hidden="true" />
          <AlertTitle>Importación terminada</AlertTitle>
          <AlertDescription>
            {projects === null ? (
              "Cargando los proyectos creados…"
            ) : loose.length > 0 ? (
              <ul className="space-y-1">
                {loose.map((project) => (
                  <li key={project.id}>
                    <Link href={project.href} className="underline underline-offset-4">
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : projects.length > 0 ? (
              "Abre cada proyecto desde la tarjeta de su tablero."
            ) : (
              "No se crearon proyectos (solo contactos u otros registros)."
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {applied ? (
        <section className="space-y-3" aria-labelledby="monday-rollback">
          <h3 id="monday-rollback" className="text-sm font-medium text-foreground">
            Deshacer importación
          </h3>
          <p className="text-sm text-muted-foreground">
            Borra todo lo que creó esta importación. Solo se puede mientras nadie haya cambiado lo importado en Cincel.
          </p>
          {loadingResult ? <p className="text-sm text-muted-foreground">Comprobando si se puede deshacer…</p> : null}
          {rollbackCheck && !rollbackCheck.canRollback ? (
            <Alert>
              <AlertTitle>No se puede deshacer</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {rollbackCheck.blockers.slice(0, 20).map((blocker) => (
                    <li key={`${blocker.table}-${blocker.id}-${blocker.kind}`}>{rollbackBlockerText(blocker)}</li>
                  ))}
                </ul>
                {rollbackCheck.blockers.length > 20 ? (
                  <p className="pt-1">Y {rollbackCheck.blockers.length - 20} más.</p>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
          <Button
            variant="destructive"
            disabled={busy || !rollbackCheck?.canRollback}
            onClick={() => setConfirming(true)}
          >
            Deshacer importación
          </Button>
        </section>
      ) : null}

      {rollback ? <JobProgress job={rollback} title="Deshacer importación" /> : null}

      {rolledBack ? (
        <Alert>
          <AlertTitle>Importación deshecha</AlertTitle>
          <AlertDescription>Se borró lo importado. Puedes empezar una importación nueva.</AlertDescription>
        </Alert>
      ) : null}

      {applied || rolledBack ? (
        <Button variant="outline" disabled={busy} onClick={onFinish}>
          Ir al tablero
        </Button>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Deshacer la importación?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán los proyectos, tareas y contactos que creó y sus archivos irán a la papelera de Drive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onStartRollback();
              }}
            >
              Deshacer importación
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
