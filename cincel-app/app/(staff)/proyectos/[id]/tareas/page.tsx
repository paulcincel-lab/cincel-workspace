import { notFound } from "next/navigation";

import { ProjectShellTabs } from "@/components/proyectos/ProjectShellTabs";
import { ProjectTareasTab } from "@/components/proyectos/ProjectTasksByFase";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectoTareas } from "@/lib/loaders/proyectos";
import { loadProyectoShell } from "@/lib/loaders/proyectos-shell";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { proyectoTareasOptions } from "@/lib/query/options/proyectos";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";
import { getQueryClient, prefetch } from "@/lib/query/server";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import { UuidSchema } from "@/lib/validation/project-flow";

type CapabilityUser = Awaited<ReturnType<typeof requireCapabilityUser>>;

/** The signed-in staff member; null without a usable session. Redirects propagate. */
async function loadUser(): Promise<CapabilityUser | null> {
  try {
    return await requireCapabilityUser();
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "FORBIDDEN")) return null;
    throw error;
  }
}

/**
 * `/proyectos/[id]/tareas` (redesign FE §2.1, §3.5): the project's tasks
 * grouped by fase, inside the project header + tabs; `AppShell` comes from
 * the staff layout. Two reads, prefetched through their loaders and
 * hydrated: the shell (`qk.proyectos.shell(id)`) and the tab
 * (`qk.proyectos.tab(id, 'tareas')`, one task read). The `estado`,
 * `responsable` and `q` filters are client state over the loaded rows.
 */
export default async function ProjectTareasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const user = await loadUser();
  if (!user || !resolveProjectsCapabilities(user).canViewProjects) notFound();
  if (!UuidSchema.safeParse(projectId).success) notFound();

  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, proyectoShellOptions(projectId), () => loadProyectoShell(user, { id: projectId })),
    prefetch(qc, proyectoTareasOptions(projectId), () => loadProyectoTareas(user, { id: projectId })),
  ]);
  if (!qc.getQueryData<ProjectTabShell | null>(qk.proyectos.shell(projectId))) notFound();

  return (
    <Hydrate qc={qc}>
      <div className="flex flex-col gap-4">
        <ProjectShellTabs projectId={projectId} active="tareas" showEstilo />
        <ProjectTareasTab projectId={projectId} />
      </div>
    </Hydrate>
  );
}
