"use client";

import { FolderKanban } from "lucide-react";

import { EmptyState } from "@/components/shell/EmptyState";
import { ProgressListWidget } from "@/components/widgets/ProgressListWidget";
import { WidgetCard } from "@/components/widgets/WidgetCard";
import { useInicioCollapsible } from "@/lib/stores/inicio-dashboard-store";
import type { ProgressItem } from "@/lib/types/widgets";

export type ProjectProgressListProps = { items: ProgressItem[] };

const TITLE = "Avance de proyectos activos";

/**
 * "Avance de proyectos activos" (redesign FE §3.2, §4.3): an instance of
 * `ProgressListWidget` (bars, "name … %" list, or Real / Plan / Desv. /
 * Presup. table). No projects → `EmptyState` "Aún no hay proyectos activos".
 * The card collapses.
 */
export function ProjectProgressList({ items }: ProjectProgressListProps) {
  const collapsible = useInicioCollapsible("projectsProgress");
  if (items.length === 0) {
    return (
      <WidgetCard title={TITLE} collapsible={collapsible}>
        <EmptyState
          icon={FolderKanban}
          title="Aún no hay proyectos activos"
          action={{ label: "Nuevo proyecto", href: "/proyectos" }}
        />
      </WidgetCard>
    );
  }
  return <ProgressListWidget title={TITLE} items={items} variant="bars" collapsible={collapsible} />;
}
