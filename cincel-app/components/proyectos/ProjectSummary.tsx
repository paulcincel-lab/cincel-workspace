"use client";

import { useMemo } from "react";
import { useInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";

import { PageStyleLayout } from "@/components/widgets/PageStyleLayout";
import { ResumenAnaliticoLayout } from "@/components/widgets/ResumenAnaliticoLayout";
import { ResumenEsencialLayout } from "@/components/widgets/ResumenEsencialLayout";
import { ResumenVisualLayout } from "@/components/widgets/ResumenVisualLayout";
import { ErrorState } from "@/components/shell/ErrorState";
import { useQuickAddCreate } from "@/components/tareas/quick-add-create";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import { proyectoHistoryOptions, proyectoResumenOptions, proyectoTareasOptions } from "@/lib/query/options/proyectos";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { useQuickAddRecent } from "@/lib/stores/quick-add-store";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";

/** The Resumen tab of one project, read from `qk.proyectos.resumen(id)`. */
export type ProjectSummaryProps = { projectId: string };

/**
 * Everything the Resumen renders, loaded on the server (see
 * `lib/proyectos/project-resumen.ts`). `showClientContacts` is
 * `canSeeAdminData`, or a project member with `clients.canViewClients`;
 * `showBudget` is `canSeeAdminData`.
 */
export type ProjectSummaryContentProps = { data: ProjectSummaryInput };

export const RESUMEN_NOT_FOUND_TITLE = "Proyecto no encontrado";

/**
 * Proyecto · Resumen: reads `qk.proyectos.resumen(id)` (prefetched by the
 * page, so the first render makes no call) and renders `ProjectSummaryContent`.
 * Null data (the project is gone or out of reach) shows the not-found state.
 */
export function ProjectSummary({ projectId }: ProjectSummaryProps) {
  const { data } = useSuspenseQuery(proyectoResumenOptions(projectId));
  if (!data) {
    return <ErrorState title={RESUMEN_NOT_FOUND_TITLE} description="El proyecto no existe o ya no tienes acceso." />;
  }
  return <ProjectSummaryContent data={data} />;
}

/**
 * Proyecto · Resumen (redesign FE §3.5, ADR 0004): one layout per style
 * through `PageStyleLayout`. Visual is `ResumenVisualLayout` (#995),
 * Esencial `ResumenEsencialLayout` (#996) and Analítico
 * `ResumenAnaliticoLayout` (#997). Every layout gets the same Resumen data;
 * the budget is absent without `showBudget` and the client contacts without
 * `showClientContacts`.
 */
export function ProjectSummaryContent({ data }: ProjectSummaryContentProps) {
  return (
    <PageStyleLayout
      visual={() => <ResumenVisual data={data} />}
      esencial={() => <ResumenEsencialLayout data={data} />}
      analitico={() => <ResumenAnaliticoLayout data={data} />}
    />
  );
}

/**
 * Visual Resumen (`ResumenVisualLayout`): also reads the project's task list
 * (`qk.proyectos.tab(id, "tareas")`) and the first bitácora page
 * (`qk.proyectos.history(id)`), both prefetched by the page. A failed
 * history read only affects "Actividad reciente". The quick-add creates the
 * task in this project; its invalidations refresh the task list, the
 * Resumen, the shell counts and the portfolio list.
 */
function ResumenVisual({ data }: ProjectSummaryContentProps) {
  const projectId = data.project.id;
  const { data: tareas } = useSuspenseQuery(proyectoTareasOptions(projectId));
  const history = useInfiniteQuery(proyectoHistoryOptions(projectId));
  const user = useSessionStore(selectAuthenticatedUser);
  const canCreate = useMemo(() => resolveActivitiesCapabilities(user).canCreateActivity, [user]);
  const { create } = useQuickAddCreate();
  const recentIds = useQuickAddRecent((state) => state.recent);
  const openNewTask = useNewTaskUi((state) => state.openNewTask);

  return (
    <ResumenVisualLayout
      data={data}
      tasks={tareas?.tasks ?? []}
      history={{
        events: history.data?.pages[0]?.events ?? [],
        status: history.isPending ? "pending" : history.isError && !history.data ? "error" : "success",
        onRetry: () => void history.refetch(),
      }}
      canCreate={canCreate}
      onQuickAdd={create}
      onNewTask={() => openNewTask({ projectId }, "proyecto")}
      recentIds={recentIds}
    />
  );
}
