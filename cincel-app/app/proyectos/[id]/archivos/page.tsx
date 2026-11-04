import Link from "next/link";
import type { ReactNode } from "react";

import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import { ProjectFilesBrowser } from "@/components/proyectos/ProjectFilesBrowser";
import { ProjectSectionNav } from "@/components/proyectos/ProjectSectionNav";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { getStaffFilesProject, listStaffProjectFiles } from "@/lib/google/staff-files-app";
import { isStaffFolderNotFound } from "@/lib/google/staff-files";
import { cn } from "@/lib/utils";
import type { StaffFilesResult } from "@/lib/types/workspace-access";

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
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <Link href="/proyectos" className={cn(buttonVariants(), "mt-4")}>
        Volver a proyectos
      </Link>
    </div>
  );
}

type Loaded = { kind: "ok"; result: StaffFilesResult } | { kind: "not_found" } | { kind: "drive_error" };

async function loadFiles(staffId: string, projectId: string, folderId: string | null): Promise<Loaded> {
  const project = await getStaffFilesProject(projectId);
  if (!project) return { kind: "not_found" };
  try {
    return { kind: "ok", result: await listStaffProjectFiles(staffId, project, folderId) };
  } catch (error) {
    if (isStaffFolderNotFound(error)) return { kind: "not_found" };
    console.error("[archivos] Drive request failed", error);
    return { kind: "drive_error" };
  }
}

/** `/proyectos/[id]/archivos?folder=` (FE §2.3): the project's Drive folder. Every staff member can view it. */
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
  if (!user) {
    return (
      <Shell>
        <StateCard title="Sin permiso" message="Inicia sesión para ver los archivos del proyecto." />
      </Shell>
    );
  }

  const loaded = await loadFiles(user.member.id, projectId, folderId);
  if (loaded.kind === "not_found") {
    return (
      <Shell>
        <ProjectSectionNav projectId={projectId} />
        <StateCard title="Carpeta no encontrada" message="El proyecto o la carpeta no existen." />
      </Shell>
    );
  }

  return (
    <Shell>
      <ProjectSectionNav projectId={projectId} />
      <h1 className="mb-4 text-2xl font-bold text-foreground">Archivos</h1>
      {loaded.kind === "drive_error" ? (
        <Alert variant="destructive">
          <AlertTitle>No se pudo leer la carpeta en Drive.</AlertTitle>
          <AlertDescription>Intenta de nuevo en unos minutos.</AlertDescription>
        </Alert>
      ) : (
        <ProjectFilesBrowser
          projectId={projectId}
          result={loaded.result}
          canRetry={resolveProjectsCapabilities(user).canEditProjectGeneral}
        />
      )}
    </Shell>
  );
}
