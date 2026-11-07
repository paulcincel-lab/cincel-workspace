import { notFound, redirect } from "next/navigation";

import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { ProjectTasksByFase } from "@/components/proyectos/ProjectTasksByFase";
import { ErrorState } from "@/components/shell/ErrorState";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { fetchTasksAction } from "@/lib/actions/tasks-actions";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { actionErrorText } from "@/lib/errors";
import { loadProjectTabShell } from "@/lib/projects/project-tab-shell";
import { parseProjectTasksQuery } from "@/lib/proyectos/project-tasks-by-fase";
import { canSeeAdminData } from "@/lib/tramos/compat";
import type { TaskKind } from "@/lib/types/core";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";
import { PresentationStyleSchema } from "@/lib/validation/redesign";

type CapabilityUser = Awaited<ReturnType<typeof requireCapabilityUser>>;
type SearchParams = Record<string, string | string[] | undefined>;

/** Admin tasks are asked for only by administrators; the repository drops them for anyone else (BE §8.6). */
const ADMIN_TASK_KINDS: TaskKind[] = ["workflow", "usuario", "admin"];

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
 * the staff layout. The tab exists only in the redesign: with the flag off
 * the project opens on its legacy Ficha, which lists the project's tasks.
 */
export default async function ProjectTareasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id: projectId }, sp] = await Promise.all([params, searchParams]);

  const appearance = await getResolvedAppearance();
  if (!appearance.redesignEnabled) redirect(`/proyectos/${encodeURIComponent(projectId)}/ficha`);

  const user = await loadUser();
  if (!user || !resolveProjectsCapabilities(user).canViewProjects) notFound();

  const includeAdmin = canSeeAdminData(user);
  const [shell, tasksResult] = await Promise.all([
    loadProjectTabShell(projectId, user),
    fetchTasksAction({ projectId, ...(includeAdmin ? { kind: ADMIN_TASK_KINDS } : {}) }).then(
      (rows) => ({ ok: true as const, rows }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
  ]);
  if (!shell) notFound();

  const query = parseProjectTasksQuery(sp);
  const rawEstilo = Array.isArray(sp.estilo) ? sp.estilo[0] : sp.estilo;
  const estilo = PresentationStyleSchema.safeParse(rawEstilo);
  const { detail } = shell;

  return (
    <StyleProvider style={estilo.success ? estilo.data : appearance.style} scope="staff" isOverridden={estilo.success}>
      <div className="flex flex-col gap-4">
        <ProjectTabs
          project={{
            ...shell.project,
            projectType: detail.projectType,
            addressCity: detail.addressCity,
            manager: detail.manager,
          }}
          active="tareas"
          counts={shell.counts}
          canManagePortal={shell.canManagePortal}
          showEstilo
        />
        {tasksResult.ok ? (
          <ProjectTasksByFase projectId={detail.id} tasks={tasksResult.rows} includeAdmin={includeAdmin} query={query} />
        ) : (
          <ErrorState title="No se pudieron cargar las tareas." description={actionErrorText(tasksResult.error)} />
        )}
      </div>
    </StyleProvider>
  );
}
