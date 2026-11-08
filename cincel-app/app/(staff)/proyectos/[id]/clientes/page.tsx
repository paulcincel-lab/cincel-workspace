import Link from "next/link";

import { ProjectClientesView } from "@/components/proyectos/ProjectClientesView";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolvePortalCapabilities, type PortalCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProyectoClientes, loadProyectoClientesActivity, type ProyectoClientesData } from "@/lib/loaders/proyectos";
import { loadProyectoShell } from "@/lib/loaders/proyectos-shell";
import type { ProjectTabShell } from "@/lib/projects/project-tab-shell";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { proyectoClientesActivityOptions, proyectoClientesOptions } from "@/lib/query/options/proyectos";
import { proyectoShellOptions } from "@/lib/query/options/proyectos-shell";
import { getQueryClient, prefetch } from "@/lib/query/server";

/** Portal capabilities of the signed-in staff member; null without a usable session. Redirects propagate. */
async function loadCapabilities(): Promise<
  { capabilities: PortalCapabilities; user: AuthenticatedUser } | null
> {
  try {
    const user = await requireCapabilityUser();
    return { capabilities: resolvePortalCapabilities(user), user };
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
 * `/proyectos/[id]/clientes` (FE §2.4, §3.5): portal access for this project,
 * `ProjectTabs` + `PortalAccessPanel`, no styles. Needs `portal.manageAccess`.
 * Prefetches `proyectos.shell(id)`, `proyectos.tab(id, 'clientes')` and
 * `proyectos.clientesActivity(id)` in parallel (Query Migration 5d, #962);
 * no Drive call.
 */
export default async function ProjectClientesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const viewer = await loadCapabilities();
  if (!viewer || !viewer.capabilities.manageAccess) {
    return <StateCard title="Sin permiso" message="Tu acceso actual no permite administrar los clientes del portal." />;
  }

  const { user } = viewer;
  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, proyectoShellOptions(projectId), () => loadProyectoShell(user, { id: projectId })),
    prefetch(qc, proyectoClientesOptions(projectId), () => loadProyectoClientes(user, { id: projectId })),
    prefetch(qc, proyectoClientesActivityOptions(projectId), () =>
      loadProyectoClientesActivity(user, { id: projectId }),
    ),
  ]);
  const shell = qc.getQueryData<ProjectTabShell | null>(qk.proyectos.shell(projectId));
  const clientes = qc.getQueryData<ProyectoClientesData | null>(qk.proyectos.tab(projectId, "clientes"));
  if (!shell || clientes === null) {
    return <StateCard title="Proyecto no encontrado" message="No existe un proyecto con este identificador." />;
  }

  return (
    <Hydrate qc={qc}>
      <ProjectClientesView projectId={projectId} />
    </Hydrate>
  );
}
