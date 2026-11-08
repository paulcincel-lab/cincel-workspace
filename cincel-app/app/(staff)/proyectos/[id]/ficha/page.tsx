import Link from "next/link";

import { buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadCatalogContacts, loadCatalogStaff, loadCatalogWorkflows } from "@/lib/loaders/catalog";
import { loadProyectoFicha, loadProyectoHistory } from "@/lib/loaders/proyectos";
import { loadProyectoShell } from "@/lib/loaders/proyectos-shell";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { catalogContactsOptions, catalogStaffOptions, catalogTramosOptions } from "@/lib/query/options/catalog";
import { proyectoFichaOptions, proyectoHistoryOptions, seedFichaKeys } from "@/lib/query/options/proyectos";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";
import { getQueryClient, prefetch } from "@/lib/query/server";

import { FichaTabs } from "./FichaTabs";
import { ProjectFichaClient } from "./ProjectFichaClient";

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
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{title}</h1>
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Link href="/proyectos" className={buttonVariants()}>
          Volver a proyectos
        </Link>
      </CardFooter>
    </Card>
  );
}

/**
 * `/proyectos/[id]/ficha` (FE §3.5): the ficha form under `ProjectTabs`.
 * Prefetches the shell (`qk.proyectos.shell`), the ficha
 * (`qk.proyectos.tab(id,'ficha')`, which also seeds the espacios and import
 * data keys) and the first Bitácora page, plus the catalogs the editor needs
 * when the viewer can edit, so the client makes no call after hydration.
 * The loaders strip admin-only fields before anything is dehydrated.
 */
export default async function ProjectFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const user = await loadUser();
  if (!user) return <StateCard title="Sin permiso" message="Inicia sesión para ver la ficha del proyecto." />;

  const qc = getQueryClient();
  await prefetch(qc, proyectoShellOptions(projectId), () => loadProyectoShell(user, { id: projectId }));
  if (!qc.getQueryData<ProjectTabShell | null>(qk.proyectos.shell(projectId))) {
    return <StateCard title="Proyecto no encontrado" message="No existe un proyecto con este identificador." />;
  }

  const caps = resolveProjectsCapabilities(user);
  const isAdmin = canSeeAdminData(user);
  await Promise.all([
    prefetch(qc, proyectoFichaOptions(projectId), async () => {
      const data = await loadProyectoFicha(user, { id: projectId });
      seedFichaKeys(qc, projectId, data);
      return data;
    }),
    qc.prefetchInfiniteQuery({
      ...proyectoHistoryOptions(projectId),
      queryFn: () => loadProyectoHistory(user, { id: projectId, cursor: null }),
    }),
    // The editor's pickers (members, contacts, admin client and origin).
    caps.canEditProjectGeneral
      ? prefetch(qc, catalogStaffOptions(), () => loadCatalogStaff(user))
      : null,
    caps.canEditProjectGeneral
      ? prefetch(qc, catalogContactsOptions(), () => loadCatalogContacts(user, {}))
      : null,
    // The tramos card lists tramos to start, and "Asignar tramo" for admins.
    caps.canChangeProjectStage || isAdmin ? prefetch(qc, catalogTramosOptions(), () => loadCatalogWorkflows()) : null,
  ]);

  return (
    <Hydrate qc={qc}>
      <ProjectFichaClient projectId={projectId} tabs={<FichaTabs projectId={projectId} />} />
    </Hydrate>
  );
}
