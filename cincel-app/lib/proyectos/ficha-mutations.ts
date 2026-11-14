"use client";

import type { QueryKey } from "@tanstack/react-query";

import { updateProjectAction } from "@/lib/actions/projects-actions";
import type { ProyectoFichaData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import type { ProjectDetail, ProjectInput } from "@/lib/types/core";

/**
 * The keys `updateProjectAction` changes (plan §3 Projects): the whole
 * project (`proyectos.detail(id)` prefix: shell, Resumen, every tab), the
 * list, the project picker and Inicio; a client change also the Clientes tab.
 */
export function updateProjectInvalidations(projectId: string, patch: Partial<ProjectInput>): QueryKey[] {
  return [
    qk.proyectos.detail(projectId),
    qk.proyectos.list(),
    qk.shell.projects(),
    qk.catalog.projectOptions(),
    qk.inicio(),
    ...(patch.clientId !== undefined ? [qk.proyectos.tab(projectId, "clientes")] : []),
  ];
}

/**
 * The shared `updateProject` mutation (the ficha's Datos generales and its
 * admin fields, `ProjectAdminFields`). Writes the saved project into
 * `proyectos.tab(id,'ficha')` at once, then invalidates
 * `updateProjectInvalidations`. `onFormError` shows the error copy inline
 * (the patch is a form); without it the error is a toast. `onSaved` runs
 * once the saved project is in the cache, without waiting for the refetch
 * the invalidation starts (the mutation stays pending until it settles).
 */
export function useUpdateProjectMutation(
  projectId: string,
  opts: { onFormError?: (text: string) => void; onSaved?: (project: ProjectDetail) => void } = {},
) {
  return useActionMutation<Partial<ProjectInput>, ProjectDetail>((patch) => updateProjectAction(projectId, patch), {
    errorContext: { entity: "project" },
    onFormError: opts.onFormError,
    setData: (qc, project) => {
      qc.setQueryData<ProyectoFichaData | null>(qk.proyectos.tab(projectId, "ficha"), (old) =>
        old ? { ...old, project } : old,
      );
      opts.onSaved?.(project);
    },
    invalidate: (patch) => updateProjectInvalidations(projectId, patch),
  });
}
