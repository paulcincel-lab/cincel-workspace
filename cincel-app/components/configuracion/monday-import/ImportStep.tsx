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
import { JobProgress } from "@/components/configuracion/monday-import/JobProgress";
import { isJobRunning, rollbackBlockerText } from "@/lib/monday-import/wizard-steps";
import type { MondayImportedProject, MondayImportRunState, MondayRollbackCheck } from "@/lib/types/monday-import";

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
}: {
  run: MondayImportRunState;
  projects: MondayImportedProject[];
  rollbackCheck: MondayRollbackCheck | null;
  isPending: boolean;
  error: string;
  onStartApply: () => void;
  onStartRollback: () => void;
  onFinish: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const apply = run.jobs.apply;
  const rollback = run.jobs.rollback;
  const busy = isPending || isJobRunning(apply) || isJobRunning(rollback);
  const applied = run.batchStatus === "applied";
  const rolledBack = run.batchStatus === "rolled_back";
  const canRetryApply = !applied && !rolledBack && (!apply || apply.status !== "running");

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
            {projects.length > 0 ? (
              <ul className="space-y-1">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link href={project.href} className="underline underline-offset-4">
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
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
