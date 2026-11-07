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

export const PROJECT_FOLDERS_TITLE = "Carpetas de proyectos";
export const PROJECT_FOLDERS_DESCRIPTION = "Crea en Google Drive las carpetas de los proyectos que todavía no tienen una.";

export type ProjectFoldersBackfillProps = {
  sharedDriveConfigured?: boolean;
  /**
   * Without the card and its "Carpetas de proyectos" heading: Ajustes › Google
   * renders it inside a `SettingsSection`.
   */
  bare?: boolean;
};

/**
 * Configuración → Google, section 3 "Carpetas de proyectos" (FE §2.5). The page is Administrador only.
 * Without a Shared Drive there is nowhere to create folders, so the button stays disabled with a hint.
 */
export function ProjectFoldersBackfill({ sharedDriveConfigured = true, bare = false }: ProjectFoldersBackfillProps) {
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

  const Wrapper = bare ? "div" : "section";

  return (
    <Wrapper className={bare ? "space-y-4" : "space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"}>
      {bare ? null : (
        <div>
          <h2 className="text-xl font-semibold text-foreground">{PROJECT_FOLDERS_TITLE}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{PROJECT_FOLDERS_DESCRIPTION}</p>
        </div>
      )}

      <div className="space-y-2">
        <Button
          type="button"
          onClick={run}
          disabled={isPending || !sharedDriveConfigured}
          aria-describedby={sharedDriveConfigured ? undefined : "project-folders-shared-drive-hint"}
        >
          {isPending ? "Creando carpetas…" : "Crear carpetas faltantes"}
        </Button>
        {sharedDriveConfigured ? null : (
          <p id="project-folders-shared-drive-hint" className="text-sm text-muted-foreground">
            Configura GOOGLE_SHARED_DRIVE_ID para crear carpetas
          </p>
        )}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudieron crear las carpetas. Intenta de nuevo.</AlertDescription>
        </Alert>
      ) : counts ? (
        <Alert variant={counts.failed > 0 ? "destructive" : "default"}>
          <AlertDescription>{projectFoldersSummary(counts)}</AlertDescription>
        </Alert>
      ) : null}
    </Wrapper>
  );
}
