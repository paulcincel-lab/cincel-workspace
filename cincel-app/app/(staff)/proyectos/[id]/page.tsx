import Link from "next/link";

import { ProjectShellTabs } from "@/components/proyectos/ProjectShellTabs";
import { ProjectSummary } from "@/components/proyectos/ProjectSummary";
import { buttonVariants } from "@/components/ui/shadcn/button";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectoHistory, loadProyectoResumen, loadProyectoResumenSummary } from "@/lib/loaders/proyectos";
import { loadProyectoShell } from "@/lib/loaders/proyectos-shell";
import { loadTareasListFirstPages } from "@/lib/loaders/tareas";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import {
  proyectoHistoryOptions,
  proyectoResumenOptions,
  proyectoResumenSummaryOptions,
  seedResumenArchivosCount,
} from "@/lib/query/options/proyectos";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";
import type { TareasListPages } from "@/lib/query/options/tareas";
import { getQueryClient, prefetch } from "@/lib/query/server";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import { resumenPrefetchLists, type ResumenTareasSummary } from "@/lib/proyectos/resumen-summary";
import { TAREAS_COMPLETADAS_PARAM, parseCompletadasParam } from "@/lib/tareas/query";
import { DEFAULT_HIDE_COMPLETED_TASKS } from "@/lib/ui/preferences";
import { getMyPreferences, getResolvedAppearance, getStoredOrgAppearance } from "@/lib/ui/preferences-server";
import { readEstiloOverride, resolvePageStyle } from "@/lib/ui/style-override";
import { UuidSchema } from "@/lib/validation/project-flow";

type SearchParams = Record<string, string | string[] | undefined>;

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
 * Drive listing also fills the shell's Archivos count), the task numbers
 * (`qk.proyectos.resumenSummary(id)`: server aggregates, never the task
 * list, #1051) and the first page of the bitácora (`qk.proyectos.history(id)`,
 * "Actividad reciente"). In Analítico it also prefetches, in one call, the
 * first 30 rows of every "Tareas por etapa" group (`qk.tareas.list(f)`).
 */
export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const user = await loadUser();
  if (!user) return <StateCard title="Sin permiso" message="Inicia sesión para ver el proyecto." />;
  if (!UuidSchema.safeParse(id).success) return <StateCard {...NOT_FOUND} />;

  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, proyectoShellOptions(id), () => loadProyectoShell(user, { id })),
    prefetch(qc, proyectoResumenOptions(id), () => loadProyectoResumen(user, { id })),
    prefetch(qc, proyectoResumenSummaryOptions(id), () => loadProyectoResumenSummary(user, { id })),
    qc.prefetchInfiniteQuery({
      ...proyectoHistoryOptions(id),
      queryFn: () => loadProyectoHistory(user, { id, cursor: null }),
    }),
  ]);
  const shell = qc.getQueryData<ProjectTabShell | null>(qk.proyectos.shell(id));
  const resumen = qc.getQueryData<ProjectSummaryInput | null>(qk.proyectos.resumen(id));
  if (!shell || !resumen) return <StateCard {...NOT_FOUND} />;
  seedResumenArchivosCount(qc, id, resumen);
  await prefetchAnaliticoGroups(qc, user, sp, resumen, qc.getQueryData<ResumenTareasSummary | null>(qk.proyectos.resumenSummary(id)));

  return (
    <Hydrate qc={qc}>
      <div className="flex flex-col gap-4">
        <ProjectShellTabs projectId={id} active="resumen" showEstilo />
        <ProjectSummary projectId={id} />
      </div>
    </Hydrate>
  );
}

/**
 * Analítico "Tareas por etapa": the first page of every group with rows, in
 * one `loadTareasListFirstPages` call, for the style and "Ocultar
 * completadas" the client renders (the `?estilo=` / `?completadas=`
 * overrides, else the viewer's choices). Nothing for Visual and Esencial.
 */
async function prefetchAnaliticoGroups(
  qc: ReturnType<typeof getQueryClient>,
  user: AuthenticatedUser,
  sp: SearchParams,
  resumen: ProjectSummaryInput,
  summary: ResumenTareasSummary | null | undefined,
): Promise<void> {
  if (!summary?.canViewTasks) return;
  const [appearance, org, preferences] = await Promise.all([getResolvedAppearance(), getStoredOrgAppearance(), getMyPreferences()]);
  const { style } = resolvePageStyle({
    override: readEstiloOverride(sp),
    chosen: appearance.style,
    styleDefault: org.styleDefault,
    allowUserOverride: org.allowUserOverride,
  });
  const completadas = sp[TAREAS_COMPLETADAS_PARAM];
  const hideCompleted = !parseCompletadasParam(
    typeof completadas === "string" ? completadas : null,
    !(preferences?.hideCompletedTasks ?? DEFAULT_HIDE_COMPLETED_TASKS),
  );
  const lists = resumenPrefetchLists(style, resumen, summary, hideCompleted);
  if (lists.length === 0) return;
  try {
    const pages = await loadTareasListFirstPages(user, { lists: lists.map((l) => l.filters) });
    lists.forEach((list, i) => {
      const page = pages[i];
      if (page) qc.setQueryData<TareasListPages>(qk.tareas.list(list.filters), { pages: [page], pageParams: [null] });
    });
  } catch (error) {
    // The groups load on the client instead.
    console.error("[proyecto-resumen] tareas por etapa", error);
  }
}
