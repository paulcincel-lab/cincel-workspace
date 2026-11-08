import Link from "next/link";

import { PortalAccessPanel } from "@/components/proyectos/PortalAccessPanel";
import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { listInvitablePortalContactsAction } from "@/lib/actions/portal-contacts-actions";
import { listProjectPortalAccessAction } from "@/lib/actions/portal-actions";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData, resolvePortalCapabilities, type PortalCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProjectTabShell } from "@/lib/projects/project-tab-shell";

/** Portal capabilities of the signed-in staff member; null without a usable session. Redirects propagate. */
async function loadCapabilities(): Promise<
  { capabilities: PortalCapabilities; isAdmin: boolean; user: AuthenticatedUser } | null
> {
  try {
    const user = await requireCapabilityUser();
    return { capabilities: resolvePortalCapabilities(user), isAdmin: canSeeAdminData(user), user };
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
 * `ProjectTabs` + `PortalAccessPanel`, no styles. Needs `portal.manageAccess`;
 * for non-admins the client gating reads the invitable contacts.
 */
export default async function ProjectClientesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const viewer = await loadCapabilities();
  if (!viewer || !viewer.capabilities.manageAccess) {
    return <StateCard title="Sin permiso" message="Tu acceso actual no permite administrar los clientes del portal." />;
  }

  // Both portal reads return [] for an unknown id, so they run alongside the project read.
  const [rows, contacts] = await Promise.all([
    listProjectPortalAccessAction(projectId),
    listInvitablePortalContactsAction(projectId),
  ]);
  const shell = await loadProjectTabShell(projectId, viewer.user, { clientes: rows.length });
  if (!shell) {
    return <StateCard title="Proyecto no encontrado" message="No existe un proyecto con este identificador." />;
  }
  const project = shell.detail;
  const hasClient = viewer.isAdmin ? project.client !== null : contacts.some((contact) => contact.isProjectClient);

  return (
    <div className="flex flex-col gap-4">
      <ProjectTabs
        project={shell.project}
        active="clientes"
        counts={shell.counts}
        canManagePortal
      />
      <PortalAccessPanel
        projectId={project.id}
        projectName={project.name}
        rows={rows}
        contacts={contacts}
        capabilities={viewer.capabilities}
        hasClient={hasClient}
        canAssignClient={viewer.isAdmin}
      />
    </div>
  );
}
