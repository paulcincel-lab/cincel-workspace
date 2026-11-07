import Link from "next/link";
import type { ReactNode } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { PortalAccessPanel } from "@/components/proyectos/PortalAccessPanel";
import { ProjectSectionNav } from "@/components/proyectos/ProjectSectionNav";
import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { listInvitablePortalContactsAction } from "@/lib/actions/portal-contacts-actions";
import { listProjectPortalAccessAction } from "@/lib/actions/portal-actions";
import { fetchProjectAction } from "@/lib/actions/projects-actions";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData, resolvePortalCapabilities, type PortalCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProjectTabShell } from "@/lib/projects/project-tab-shell";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

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

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <section className="flex-1 overflow-y-auto p-10">
        <Header />
        {children}
      </section>
    </main>
  );
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

/** `/proyectos/[id]/clientes` (FE §2.4): portal access for this project. Needs `portal.manageAccess`. */
export default async function ProjectClientesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const [viewer, appearance] = await Promise.all([loadCapabilities(), getResolvedAppearance()]);
  if (appearance.redesignEnabled) return redesignClientes(projectId, viewer);

  const capabilities = viewer?.capabilities ?? null;
  if (!viewer || !capabilities?.manageAccess) {
    return (
      <Shell>
        <ProjectSectionNav projectId={projectId} showClientes={false} />
        <StateCard title="Sin permiso" message="Tu acceso actual no permite administrar los clientes del portal." />
      </Shell>
    );
  }

  let project: Awaited<ReturnType<typeof fetchProjectAction>> = null;
  try {
    project = await fetchProjectAction(projectId);
  } catch {
    // Unknown id format or no project access: shown as not found below.
  }
  if (!project) {
    return (
      <Shell>
        <StateCard title="Proyecto no encontrado" message="No existe un proyecto con este identificador." />
      </Shell>
    );
  }

  const [rows, contacts] = await Promise.all([
    listProjectPortalAccessAction(project.id),
    listInvitablePortalContactsAction(project.id),
  ]);

  // `project.client` is null for non-admins, so the gating reads the invitable
  // contacts, which carry the project's own client (accepted exception, FE §3.5).
  const hasClient = viewer.isAdmin ? project.client !== null : contacts.some((contact) => contact.isProjectClient);

  return (
    <Shell>
      <ProjectSectionNav projectId={project.id} showClientes />
      <PortalAccessPanel
        projectId={project.id}
        projectName={project.name}
        rows={rows}
        contacts={contacts}
        capabilities={capabilities}
        hasClient={hasClient}
        canAssignClient={viewer.isAdmin}
      />
    </Shell>
  );
}

/**
 * Flag on (FE §2.3, §3.5): `ProjectTabs` + the same `PortalAccessPanel`, no
 * styles. Guarded by `portal.manageAccess`; the client gating reads the
 * invitable contacts for non-admins exactly as the legacy page.
 */
async function redesignClientes(projectId: string, viewer: Awaited<ReturnType<typeof loadCapabilities>>) {
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
        inProjectShell
      />
    </div>
  );
}
