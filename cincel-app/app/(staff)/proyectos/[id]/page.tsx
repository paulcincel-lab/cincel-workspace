import Link from "next/link";

import { ProjectShellTabs } from "@/components/proyectos/ProjectShellTabs";
import { ProjectSummary } from "@/components/proyectos/ProjectSummary";
import { buttonVariants } from "@/components/ui/shadcn/button";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectoHistory, loadProyectoResumen, loadProyectoTareas } from "@/lib/loaders/proyectos";
import { loadProyectoShell } from "@/lib/loaders/proyectos-shell";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import {
  proyectoHistoryOptions,
  proyectoResumenOptions,
  proyectoTareasOptions,
  seedResumenArchivosCount,
} from "@/lib/query/options/proyectos";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";
import { getQueryClient, prefetch } from "@/lib/query/server";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import { UuidSchema } from "@/lib/validation/project-flow";

/** The signed-in staff member; null without a usable session. Redirects propagate. */
async function loadUser(): Promise<AuthenticatedUser | null> {
  try {
    return await requireCapabilityUser();
  } catch (error) {
    if (error instanceof Error && (error.message === "UNAUTHENTICATED" || error.message === "FORBIDDEN")) return null;
    throw error;
  }
}

function StateCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div>
        <Link href="/proyectos" className={buttonVariants({ variant: "outline" })}>
          Volver a proyectos
        </Link>
      </div>
    </div>
  );
}

const NOT_FOUND = { title: "Proyecto no encontrado", message: "El proyecto no existe o ya no tienes acceso." };

/**
 * `/proyectos/<id>` (redesign FE §3.5): the project header + tabs and the
 * Resumen tab, inside the `AppShell` the staff layout mounts. Four reads,
 * prefetched here through their loaders and hydrated, so the first render
 * makes no client call: the shell (`qk.proyectos.shell(id)`, shared with
 * every project tab), the Resumen (`qk.proyectos.resumen(id)`, whose root
 * Drive listing also fills the shell's Archivos count), the task list
 * (`qk.proyectos.tab(id, "tareas")`, shared with the Tareas tab; the Visual
 * counts, tramo bars and "Lo que sigue" derive from it) and the first page
 * of the bitácora (`qk.proyectos.history(id)`, "Actividad reciente").
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await loadUser();
  if (!user) return <StateCard title="Sin permiso" message="Inicia sesión para ver el proyecto." />;
  if (!UuidSchema.safeParse(id).success) return <StateCard {...NOT_FOUND} />;

  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, proyectoShellOptions(id), () => loadProyectoShell(user, { id })),
    prefetch(qc, proyectoResumenOptions(id), () => loadProyectoResumen(user, { id })),
    prefetch(qc, proyectoTareasOptions(id), () => loadProyectoTareas(user, { id })),
    qc.prefetchInfiniteQuery({
      ...proyectoHistoryOptions(id),
      queryFn: () => loadProyectoHistory(user, { id, cursor: null }),
    }),
  ]);
  const shell = qc.getQueryData<ProjectTabShell | null>(qk.proyectos.shell(id));
  const resumen = qc.getQueryData<ProjectSummaryInput | null>(qk.proyectos.resumen(id));
  if (!shell || !resumen) return <StateCard {...NOT_FOUND} />;
  seedResumenArchivosCount(qc, id, resumen);

  return (
    <Hydrate qc={qc}>
      <div className="flex flex-col gap-4">
        <ProjectShellTabs projectId={id} active="resumen" showEstilo />
        <ProjectSummary projectId={id} />
      </div>
    </Hydrate>
  );
}
