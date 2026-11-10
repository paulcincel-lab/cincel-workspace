import { CronogramaProjectTabs } from "@/components/cronograma/cronograma-project-tabs";
import CronogramaView from "@/components/cronograma/cronograma-view";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectoCronograma } from "@/lib/loaders/proyectos";
import { loadProyectoShell } from "@/lib/loaders/proyectos-shell";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { proyectoCronogramaOptions } from "@/lib/query/options/proyectos";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";
import { getQueryClient, prefetch } from "@/lib/query/server";

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
 * `/proyectos/[id]/cronograma` (Query Migration 5c, #961): the shell
 * (`proyectos.shell(id)`, no Drive call) and the schedule
 * (`proyectos.cronograma(id)`) are prefetched in one `Promise.all` by calling
 * their loaders, then handed to the client through `<Hydrate>`. The client
 * makes no call after hydration; `?week=` is client state.
 */
export default async function CronogramaPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id: projectId }, user] = await Promise.all([params, loadUser()]);

  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, proyectoShellOptions(projectId), () =>
      user ? loadProyectoShell(user, { id: projectId }) : Promise.resolve(null)
    ),
    prefetch(qc, proyectoCronogramaOptions(projectId), () =>
      user ? loadProyectoCronograma(user, { id: projectId }) : Promise.resolve(null)
    ),
  ]);
  const shell = qc.getQueryData<ProjectTabShell | null>(qk.proyectos.shell(projectId)) ?? null;

  // Redesign FE §3.5: `AppShell` comes from the staff layout; the page renders
  // the project header + tabs (Estilo switch under them) and the Cronograma
  // tab, whose three styles live in `CronogramaWidget`.
  return (
    <Hydrate qc={qc}>
      <div className="flex flex-col gap-4">
        <CronogramaProjectTabs projectId={projectId} />
        <CronogramaView projectId={projectId} contractEnd={shell?.detail.endDate ?? null} />
      </div>
    </Hydrate>
  );
}
