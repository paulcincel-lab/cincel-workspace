import { notFound } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchAdminTasksAction, fetchTasksAction } from "@/lib/actions/tasks-actions";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { fetchAssignableStaffAction } from "@/lib/actions/staff-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { fetchTramoBoardAction } from "@/lib/actions/tramo-start-actions";
import { GENERAL_SLUG } from "@/lib/actividades/tramo-page";
import type { TramoBoard, WorkflowDetail } from "@/lib/types/core";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";
import { ActividadesClient } from "./ActividadesClient";

/** The Presale tramo, whose page hosts "Para administración". */
const ADMIN_TASKS_SLUG = "presale";

export default async function ActividadesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tramo: string }>;
} & LegacyPageProps) {
  const { tramo: slug } = await params;
  // Flag on: `/tareas?vista=lista&tramo=<slug>`, plus `iniciar=1` with Project Flow's `?project=X` deep link.
  await redirectLegacyIfRedesignOn(`/actividades/${encodeURIComponent(slug)}`, searchParams);
  const isGeneral = slug === GENERAL_SLUG;

  // `[tramo]` is a `workflows.key`. Resolve it first, outside the try below:
  // notFound() throws, and an unknown key has to render the 404.
  let workflows: WorkflowDetail[] | null = null;
  try {
    workflows = (await fetchWorkflowsAction()).filter((w) => w.active).sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    // Not authorized / no session: the client falls back to hydrating itself.
  }
  const workflow = isGeneral ? null : (workflows?.find((w) => w.key === slug) ?? null);
  if (!isGeneral && workflows && !workflow) notFound();

  let initialTasks: Awaited<ReturnType<typeof fetchTasksAction>> = [];
  let initialProjects: Awaited<ReturnType<typeof fetchProjectsAction>> = [];
  let initialStaff: Awaited<ReturnType<typeof fetchAssignableStaffAction>> = [];
  let initialBoard: TramoBoard | null = null;
  // "Para administración" (FE §3.1): Presale only, admins only. Undefined lets the card fetch itself.
  let initialAdminTasks: Awaited<ReturnType<typeof fetchAdminTasksAction>> | undefined;

  try {
    if (isGeneral) {
      // Every tramo's tasks.
      [initialTasks, initialProjects, initialStaff] = await Promise.all([
        fetchTasksAction(),
        fetchProjectsAction(),
        fetchAssignableStaffAction(null),
      ]);
    } else if (workflow) {
      [initialTasks, initialBoard, initialProjects, initialStaff] = await Promise.all([
        fetchTasksAction({ workflowId: workflow.id }),
        fetchTramoBoardAction(workflow.id).catch(() => null),
        fetchProjectsAction(),
        fetchAssignableStaffAction(workflow.id),
      ]);
    }
  } catch {
    // Not authorized / no session: the client falls back to hydrating itself.
  }

  if (slug === ADMIN_TASKS_SLUG) {
    try {
      initialAdminTasks = await fetchAdminTasksAction();
    } catch {
      // FORBIDDEN for non-admins (the card renders nothing), or the card retries on the client.
    }
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <ActividadesClient
          slug={slug}
          workflow={workflow}
          workflows={workflows ?? []}
          initialTasks={initialTasks}
          initialProjects={initialProjects}
          initialStaff={initialStaff}
          initialBoard={initialBoard}
          initialAdminTasks={initialAdminTasks}
        />
      </section>
    </main>
  );
}
