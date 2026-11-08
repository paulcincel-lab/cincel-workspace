"use client";

import { useSuspenseQuery } from "@tanstack/react-query";

import { ProjectTabs, type ProjectTabsProps } from "@/components/proyectos/ProjectTabs";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";

export type ProjectShellTabsProps = {
  projectId: string;
  active: ProjectTabsProps["active"];
  showEstilo?: boolean;
};

/**
 * `ProjectTabs` of the Resumen and Tareas tabs from `qk.proyectos.shell(id)`
 * (1b): the page prefetches the shell, and switching tabs within its 30 s
 * reuses it. Renders nothing once the project is gone (the page shows the
 * not-found state on the server).
 */
export function ProjectShellTabs({ projectId, active, showEstilo = false }: ProjectShellTabsProps) {
  const { data: shell } = useSuspenseQuery(proyectoShellOptions(projectId));
  if (!shell) return null;
  return (
    <ProjectTabs
      project={shell.project}
      active={active}
      counts={shell.counts}
      canManagePortal={shell.canManagePortal}
      showEstilo={showEstilo}
    />
  );
}
