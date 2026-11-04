"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { ensureMissingProjectFoldersAction } from "@/lib/actions/workspace-access-actions";
import type { EnsureMissingProjectFoldersCounts } from "@/lib/google/project-folders-app";

/** "12 creadas, 1 con error" plus omitidas when any project was skipped. */
export function projectFoldersSummary(counts: EnsureMissingProjectFoldersCounts): string {
  const parts = [`${counts.created} ${counts.created === 1 ? "creada" : "creadas"}`];
  if (counts.skipped > 0) parts.push(`${counts.skipped} ${counts.skipped === 1 ? "omitida" : "omitidas"}`);
  if (counts.failed > 0) parts.push(`${counts.failed} con error`);
  return parts.join(", ");
}

/** Configuración → Google, section 3 "Carpetas de proyectos" (FE §2.5). The page is Administrador only. */
export function ProjectFoldersBackfill() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [counts, setCounts] = useState<EnsureMissingProjectFoldersCounts | null>(null);
  const [error, setError] = useState(false);

  function run() {
    setError(false);
    startTransition(async () => {
      try {
        setCounts(await ensureMissingProjectFoldersAction());
        router.refresh();
      } catch {
        setCounts(null);
        setError(true);
      }
    });
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Carpetas de proyectos</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Crea en Google Drive las carpetas de los proyectos que todavía no tienen una.
        </p>
      </div>

      <Button type="button" onClick={run} disabled={isPending}>
        {isPending ? "Creando carpetas…" : "Crear carpetas faltantes"}
      </Button>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudieron crear las carpetas. Intenta de nuevo.</AlertDescription>
        </Alert>
      ) : counts ? (
        <Alert variant={counts.failed > 0 ? "destructive" : "default"}>
          <AlertDescription>{projectFoldersSummary(counts)}</AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
