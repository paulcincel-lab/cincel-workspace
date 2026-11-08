"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { ProjectFiles } from "@/components/proyectos/ProjectFiles";
import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { proyectoArchivosOptions } from "@/lib/query/options/proyectos";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";

export const ARCHIVOS_NOT_FOUND = "El proyecto o la carpeta no existen.";
export const ARCHIVOS_DRIVE_ERROR = "No se pudo leer la carpeta en Drive.";

/** `?folder=` of the current URL; null for the root. */
export function folderParam(params: Pick<URLSearchParams, "get"> | null): string | null {
  return params?.get("folder")?.trim() || null;
}

/**
 * `/proyectos/[id]/archivos` on the client (Query Migration 5d, #962):
 * `ProjectTabs` from `proyectos.shell(id)` and the folder from
 * `proyectos.archivos(id, folder)`, both prefetched by the page. Opening a
 * folder changes `?folder=` with `history.pushState`, so the key changes and
 * no server render runs; the previous folder stays on screen while an
 * uncached one loads.
 */
export function ProjectArchivosView({ projectId }: { projectId: string }) {
  const folder = folderParam(useSearchParams());
  const shell = useQuery(proyectoShellOptions(projectId));
  const archivos = useQuery({ ...proyectoArchivosOptions(projectId, folder), placeholderData: keepPreviousData });

  if (shell.data === null) {
    return (
      <Alert>
        <AlertTitle>Carpeta no encontrada</AlertTitle>
        <AlertDescription>{ARCHIVOS_NOT_FOUND}</AlertDescription>
      </Alert>
    );
  }

  const data = archivos.data;
  return (
    <div className="flex flex-col gap-4">
      {shell.data ? (
        <ProjectTabs
          project={shell.data.project}
          active="archivos"
          counts={shell.data.counts}
          canManagePortal={shell.data.canManagePortal}
        />
      ) : null}
      <div className="flex flex-col gap-4" aria-busy={archivos.isFetching && archivos.isPlaceholderData}>
        {data === undefined ? (
          archivos.isError ? (
            <DriveErrorAlert />
          ) : (
            <p className="text-sm text-muted-foreground">Cargando archivos…</p>
          )
        ) : data.kind === "not_found" ? (
          <Alert>
            <AlertTitle>Carpeta no encontrada</AlertTitle>
            <AlertDescription>{ARCHIVOS_NOT_FOUND}</AlertDescription>
          </Alert>
        ) : data.kind === "drive_error" ? (
          <DriveErrorAlert />
        ) : (
          <ProjectFiles projectId={projectId} result={data.result} canRetry={data.canRetry} />
        )}
      </div>
    </div>
  );
}

function DriveErrorAlert() {
  return (
    <Alert variant="destructive">
      <AlertTitle>{ARCHIVOS_DRIVE_ERROR}</AlertTitle>
      <AlertDescription>Intenta de nuevo en unos minutos.</AlertDescription>
    </Alert>
  );
}
