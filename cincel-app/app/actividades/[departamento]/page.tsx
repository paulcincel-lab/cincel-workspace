import { notFound } from "next/navigation";

import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { fetchAssignableStaffAction } from "@/lib/actions/staff-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { getDepartamento } from "@/lib/actividades/departamento";
import type { WorkflowDetail } from "@/lib/types/core";
import { ActividadesClient } from "./ActividadesClient";

export default async function ActividadesPage({
  params,
}: {
  params: Promise<{ departamento: string }>;
}) {
  const { departamento: slug } = await params;
  const departamento = getDepartamento(slug);
  if (!departamento) notFound();

  let workflow: WorkflowDetail | null = null;
  let initialTasks: Awaited<ReturnType<typeof fetchTasksAction>> = [];
  let initialProjects: Awaited<ReturnType<typeof fetchProjectsAction>> = [];
  let initialStaff: Awaited<ReturnType<typeof fetchAssignableStaffAction>> = [];

  try {
    const workflows = await fetchWorkflowsAction();
    workflow = workflows.find((w) => w.key === slug) ?? null;
    if (workflow) {
      [initialTasks, initialProjects, initialStaff] = await Promise.all([
        fetchTasksAction({ workflowId: workflow.id }),
        fetchProjectsAction(),
        fetchAssignableStaffAction(workflow.id),
      ]);
    }
  } catch {
    // Not authorized / no session — the client falls back to hydrating itself.
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        <ActividadesClient
          slug={slug}
          workflow={workflow}
          initialTasks={initialTasks}
          initialProjects={initialProjects}
          initialStaff={initialStaff}
        />
      </section>
    </main>
  );
}
