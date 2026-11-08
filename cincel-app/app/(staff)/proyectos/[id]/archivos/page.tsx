import Link from "next/link";

import { ProjectArchivosView } from "@/components/proyectos/ProjectArchivosView";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectoArchivos, type ProyectoArchivosData } from "@/lib/loaders/proyectos";
import { loadProyectoShell } from "@/lib/loaders/proyectos-shell";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { proyectoArchivosOptions } from "@/lib/query/options/proyectos";
import { seedArchivosCount } from "@/lib/query/options/proyectos-archivos-clientes";
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

/** `/proyectos/[id]/archivos?folder=` (FE §2.3): the project's Drive folder, for staff who can see the project. */
export default async function ProjectArchivosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ folder?: string | string[] }>;
}) {
  const [{ id: projectId }, query] = await Promise.all([params, searchParams]);
  const rawFolder = Array.isArray(query.folder) ? query.folder[0] : query.folder;
  const folderId = rawFolder?.trim() || null;

  const user = await loadUser();
  return renderArchivosTab({ user, projectId, folderId });
}

/** Card for the tab's own states (the layout mounts `AppShell`). */
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

/**
 * `ProjectTabs` + the Archivos tab in three styles (FE §3.5), prefetched in
 * parallel (Query Migration 5d, #962): `proyectos.shell(id)` and
 * `proyectos.archivos(id, folder)`. The root listing seeds the shell's
 * Archivos count, so Drive is listed once per page (none with `?folder=` for
 * the count). Folder navigation then runs on the client.
 */
async function renderArchivosTab({
  user,
  projectId,
  folderId,
}: {
  user: CapabilityUser | null;
  projectId: string;
  folderId: string | null;
}) {
  if (!user) {
    return <StateCard title="Sin permiso" message="Inicia sesión para ver los archivos del proyecto." />;
  }

  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, proyectoShellOptions(projectId), () => loadProyectoShell(user, { id: projectId })),
    prefetch(qc, proyectoArchivosOptions(projectId, folderId), () =>
      loadProyectoArchivos(user, { id: projectId, folderId }),
    ),
  ]);
  const shell = qc.getQueryData<ProjectTabShell | null>(qk.proyectos.shell(projectId));
  const files = qc.getQueryData<ProyectoArchivosData>(qk.proyectos.archivos(projectId, folderId));
  if (!shell || files?.kind === "not_found") {
    return <StateCard title="Carpeta no encontrada" message="El proyecto o la carpeta no existen." />;
  }
  if (!folderId) seedArchivosCount(qc, projectId, files);

  // `ListPage` renders the tab's `EstiloSwitch` (FE §4.11), so `ProjectTabs` doesn't repeat it.
  return (
    <Hydrate qc={qc}>
      <ProjectArchivosView projectId={projectId} />
    </Hydrate>
  );
}
