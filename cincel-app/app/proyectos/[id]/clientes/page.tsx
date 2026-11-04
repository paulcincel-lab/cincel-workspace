import Link from "next/link";
import type { ReactNode } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { PortalAccessPanel } from "@/components/proyectos/PortalAccessPanel";
import { ProjectSectionNav } from "@/components/proyectos/ProjectSectionNav";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { listInvitablePortalContactsAction } from "@/lib/actions/portal-contacts-actions";
import { listProjectPortalAccessAction } from "@/lib/actions/portal-actions";
import { fetchProjectAction } from "@/lib/actions/projects-actions";
import { resolvePortalCapabilities, type PortalCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";

/** Portal capabilities of the signed-in staff member; null without a usable session. Redirects propagate. */
async function loadCapabilities(): Promise<PortalCapabilities | null> {
  try {
    return resolvePortalCapabilities(await requireCapabilityUser());
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

  const capabilities = await loadCapabilities();
  if (!capabilities?.manageAccess) {
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

  return (
    <Shell>
      <ProjectSectionNav projectId={project.id} showClientes />
      <PortalAccessPanel
        projectId={project.id}
        projectName={project.name}
        rows={rows}
        contacts={contacts}
        capabilities={capabilities}
      />
    </Shell>
  );
}
