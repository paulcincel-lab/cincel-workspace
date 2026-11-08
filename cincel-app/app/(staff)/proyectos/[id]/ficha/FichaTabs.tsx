"use client";

import { useQuery } from "@tanstack/react-query";

import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";

/**
 * `ProjectTabs` of the ficha from `qk.proyectos.shell(id)` (1b): the page
 * prefetches it, and the other tabs reuse the cached shell within its 30 s.
 */
export function FichaTabs({ projectId }: { projectId: string }) {
  const { data: shell } = useQuery(proyectoShellOptions(projectId));
  if (!shell) return null;
  return (
    <ProjectTabs project={shell.project} active="ficha" counts={shell.counts} canManagePortal={shell.canManagePortal} />
  );
}
