"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";

/**
 * The project header and tabs of the Cronograma tab, from the prefetched
 * `qk.proyectos.shell(id)` (1b, #954): an import invalidates it and the header
 * follows; the Estilo switch sits under the tabs (`showEstilo`). Nothing when
 * the viewer can't see the project.
 */
export function CronogramaProjectTabs({ projectId }: { projectId: string }) {
  const { data: shell } = useSuspenseQuery(proyectoShellOptions(projectId));
  if (!shell) return null;
  return (
    <ProjectTabs
      project={shell.project}
      active="cronograma"
      counts={shell.counts}
      canManagePortal={shell.canManagePortal}
      showEstilo
    />
  );
}
