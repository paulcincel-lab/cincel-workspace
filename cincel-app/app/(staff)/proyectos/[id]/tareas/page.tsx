import { notFound } from "next/navigation";

import { ProjectShellTabs } from "@/components/proyectos/ProjectShellTabs";
import { ProjectTareasTab } from "@/components/proyectos/ProjectTasksByFase";
import { canSeeAdminData, resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectoTareasSummary } from "@/lib/loaders/proyectos";
import { loadTareasListPage } from "@/lib/loaders/tareas";
import { parseProjectTasksQuery, projectTareasKeysOf } from "@/lib/proyectos/project-tasks-by-fase";
import { loadProyectoShell } from "@/lib/loaders/proyectos-shell";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { proyectoTareasSummaryOptions } from "@/lib/query/options/proyectos";
import { tareasListInfiniteOptions } from "@/lib/query/options/tareas";
import { TAREAS_COMPLETADAS_PARAM, parseCompletadasParam } from "@/lib/tareas/query";
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
 * the staff layout. Three reads, prefetched through their loaders and
 * hydrated: the shell (`qk.proyectos.shell(id)`), the tab's counts
 * (`qk.proyectos.tareasSummary(id, f)`) and the first 30 rows of its list
 * (`qk.tareas.list(f)`) for the URL's `estado`, `responsable`, `q` and
 * `completadas` (#1051). "Cargar más" and filter changes read the next pages
 * on the client; the server searches and filters.
 */
export default async function ProjectTareasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: projectId } = await params;
  const sp = (await searchParams) ?? {};

  const user = await loadUser();
  if (!user || !resolveProjectsCapabilities(user).canViewProjects) notFound();
  if (!UuidSchema.safeParse(projectId).success) notFound();

  const qc = getQueryClient();
  const query = parseProjectTasksQuery(sp);
  const completadas = sp[TAREAS_COMPLETADAS_PARAM];
  const hideCompleted = !parseCompletadasParam(typeof completadas === "string" ? completadas : null, true);
  const keys = projectTareasKeysOf(projectId, query, { hideCompleted, includeAdmin: canSeeAdminData(user) });
  const canViewTasks = resolveActivitiesCapabilities(user).canViewActivities;
  await Promise.all([
    prefetch(qc, proyectoShellOptions(projectId), () => loadProyectoShell(user, { id: projectId })),
    prefetch(qc, proyectoTareasSummaryOptions(projectId, keys.summary), () =>
      loadProyectoTareasSummary(user, { id: projectId, ...keys.summary }),
    ),
    canViewTasks
      ? qc.prefetchInfiniteQuery({
          ...tareasListInfiniteOptions(keys.list),
          queryFn: () =>
            loadTareasListPage(user, {
              filters: keys.list,
              cursor: null,
              ...(keys.list.orderBy ? { orderBy: keys.list.orderBy } : {}),
              ...(keys.list.orderDir ? { orderDir: keys.list.orderDir } : {}),
            }),
        })
      : Promise.resolve(),
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
