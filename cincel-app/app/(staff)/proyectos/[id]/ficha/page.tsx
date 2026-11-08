import Link from "next/link";

import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadProjectTabShell } from "@/lib/projects/project-tab-shell";

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
 * `/proyectos/[id]/ficha` (FE §3.5): the ficha form under `ProjectTabs` (no
 * styles); admin fields stay behind `canSeeAdminData` inside the form.
 */
export default async function ProjectFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;

  const user = await loadUser();
  if (!user) return <StateCard title="Sin permiso" message="Inicia sesión para ver la ficha del proyecto." />;

  const shell = await loadProjectTabShell(projectId, user);
  if (!shell) {
    return <StateCard title="Proyecto no encontrado" message="No existe un proyecto con este identificador." />;
  }

  return (
    <ProjectFichaClient
      tabs={
        <ProjectTabs
          project={shell.project}
          active="ficha"
          counts={shell.counts}
          canManagePortal={shell.canManagePortal}
        />
      }
    />
  );
}
