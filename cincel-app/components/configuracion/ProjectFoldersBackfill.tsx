"use client";

import type { Query } from "@tanstack/react-query";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { ensureMissingProjectFoldersAction } from "@/lib/actions/workspace-access-actions";
import type { EnsureMissingProjectFoldersCounts } from "@/lib/google/project-folders-app";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";

/** "12 creadas, 1 con error" plus omitidas when any project was skipped. */
export function projectFoldersSummary(counts: EnsureMissingProjectFoldersCounts): string {
  const parts = [`${counts.created} ${counts.created === 1 ? "creada" : "creadas"}`];
  if (counts.skipped > 0) parts.push(`${counts.skipped} ${counts.skipped === 1 ? "omitida" : "omitidas"}`);
  if (counts.failed > 0) parts.push(`${counts.failed} con error`);
  return parts.join(", ");
}

/** Every cached project file listing: `qk.proyectos.archivos(id, folder)` = `["proyectos", id, "archivos", …]`. */
export function isProjectArchivosQuery(query: Pick<Query, "queryKey">): boolean {
  return query.queryKey[0] === "proyectos" && query.queryKey[2] === "archivos";
}

export const PROJECT_FOLDERS_TITLE = "Carpetas de proyectos";
export const PROJECT_FOLDERS_DESCRIPTION = "Crea en Google Drive las carpetas de los proyectos que todavía no tienen una.";

/** "3 proyectos sin carpeta" / "1 proyecto sin carpeta". */
export function projectsWithoutFolderText(count: number): string {
  return `${count === 1 ? "proyecto" : "proyectos"} sin carpeta`;
}

export type ProjectFoldersBackfillProps = {
  sharedDriveConfigured?: boolean;
  /**
   * Live projects without / with their Drive folders (`GoogleHealth`). With
   * them the summary line shows and the button is disabled at 0 missing.
   */
  folderCounts?: { withoutFolder: number; withFolder: number } | null;
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
export function ProjectFoldersBackfill({ sharedDriveConfigured = true, bare = false, folderCounts = null }: ProjectFoldersBackfillProps) {
  // New folders show on Ajustes › Google (Estado) and in every project's Archivos.
  const backfill = useActionMutation(ensureMissingProjectFoldersAction, {
    invalidate: [qk.ajustes.page("google")],
    setData: (qc) => {
      void qc.invalidateQueries({ predicate: isProjectArchivosQuery });
    },
    // The error copy is the Alert below.
    onFormError: () => undefined,
  });
  const isPending = backfill.isPending;
  const counts: EnsureMissingProjectFoldersCounts | null = backfill.isError ? null : (backfill.data ?? null);
  const error = backfill.isError;

  function run() {
    backfill.mutate(undefined);
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
        {folderCounts ? (
          <p className="text-[13px] text-muted-foreground">
            <strong className="font-semibold text-foreground">{folderCounts.withoutFolder}</strong>{" "}
            {projectsWithoutFolderText(folderCounts.withoutFolder)} · {folderCounts.withFolder} con carpeta en la unidad
            compartida
          </p>
        ) : null}
        <Button
          type="button"
          onClick={run}
          disabled={isPending || !sharedDriveConfigured || folderCounts?.withoutFolder === 0}
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
