"use client";

import type { WorkflowRef } from "@/lib/types/core";
import type { ProjectRef } from "@/lib/types/redesign";

export type ProjectTabsProps = {
  project: ProjectRef & { tramo: WorkflowRef | null };
  active: "resumen" | "tareas" | "cronograma" | "archivos" | "clientes" | "ficha";
  counts: { tareas: number; archivos: number; clientes: number };
  canManagePortal: boolean;
};

/**
 * Project header + tabs (redesign FE §3.5, §4.6): extends `ProjectSectionNav`;
 * Clientes only with `portal.manageAccess`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function ProjectTabs(props: ProjectTabsProps) {
  void props;
  return null;
}
