"use client";

import { useQuery } from "@tanstack/react-query";

import { PortalAccessPanel } from "@/components/proyectos/PortalAccessPanel";
import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { proyectoClientesOptions } from "@/lib/query/options/proyectos";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";

export const CLIENTES_NOT_FOUND = "No existe un proyecto con este identificador.";

/**
 * `/proyectos/[id]/clientes` on the client (Query Migration 5d, #962):
 * `ProjectTabs` from `proyectos.shell(id)` and `PortalAccessPanel` from
 * `proyectos.tab(id, 'clientes')`, both prefetched by the page with the
 * activity. Mutations invalidate these keys; nothing refreshes the route.
 */
export function ProjectClientesView({ projectId }: { projectId: string }) {
  const shell = useQuery(proyectoShellOptions(projectId));
  const clientes = useQuery(proyectoClientesOptions(projectId));

  if (shell.data === null || clientes.data === null) {
    return (
      <Alert>
        <AlertTitle>Proyecto no encontrado</AlertTitle>
        <AlertDescription>{CLIENTES_NOT_FOUND}</AlertDescription>
      </Alert>
    );
  }

  const data = clientes.data;
  return (
    <div className="flex flex-col gap-4">
      {shell.data ? (
        <ProjectTabs project={shell.data.project} active="clientes" counts={shell.data.counts} canManagePortal />
      ) : null}
      {data ? (
        <PortalAccessPanel
          projectId={projectId}
          projectName={shell.data?.project.name ?? ""}
          rows={data.rows}
          contacts={data.contacts}
          capabilities={data.capabilities}
          hasClient={data.hasClient}
          canAssignClient={data.canAssignClient}
        />
      ) : clientes.isError ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudieron cargar los clientes del proyecto.</AlertDescription>
        </Alert>
      ) : (
        <p className="text-sm text-muted-foreground">Cargando clientes…</p>
      )}
    </div>
  );
}
