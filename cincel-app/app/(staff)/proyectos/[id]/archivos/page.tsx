import Link from "next/link";

import { ProjectFiles } from "@/components/proyectos/ProjectFiles";
import { ProjectTabs } from "@/components/proyectos/ProjectTabs";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/shadcn/alert";
import { buttonVariants } from "@/components/ui/shadcn/button";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { getStaffFilesProject, listStaffProjectFiles } from "@/lib/google/staff-files-app";
import { isStaffFolderNotFound } from "@/lib/google/staff-files";
import { filesCount } from "@/lib/projects/project-files-view";
import { loadProjectTabShell } from "@/lib/projects/project-tab-shell";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { StaffFilesResult } from "@/lib/types/workspace-access";
import { getResolvedAppearance } from "@/lib/ui/preferences-server";

const STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];

/** `?estilo=visual|esencial|analitico` overrides the style for this render only (FE §4.2). */
function estiloOverride(value: string | string[] | undefined): PresentationStyle | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return STYLES.find((s) => s === raw) ?? null;
}

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
  searchParams: Promise<{ folder?: string | string[]; estilo?: string | string[] }>;
}) {
  const [{ id: projectId }, query] = await Promise.all([params, searchParams]);
  const rawFolder = Array.isArray(query.folder) ? query.folder[0] : query.folder;
  const folderId = rawFolder?.trim() || null;

  const [user, appearance] = await Promise.all([loadUser(), getResolvedAppearance()]);
  return (
    <ArchivosTab
      user={user}
      projectId={projectId}
      folderId={folderId}
      estilo={estiloOverride(query.estilo)}
      style={appearance.style}
    />
  );
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

/** `ProjectTabs` + the Archivos tab in three styles (FE §3.5). */
async function ArchivosTab({
  user,
  projectId,
  folderId,
  estilo,
  style,
}: {
  user: CapabilityUser | null;
  projectId: string;
  folderId: string | null;
  estilo: PresentationStyle | null;
  style: PresentationStyle;
}) {
  if (!user) {
    return <StateCard title="Sin permiso" message="Inicia sesión para ver los archivos del proyecto." />;
  }

  const loaded = await loadFiles(user.member.id, projectId, folderId);
  if (loaded.kind === "not_found") {
    return <StateCard title="Carpeta no encontrada" message="El proyecto o la carpeta no existen." />;
  }

  // The tab count is the folder the tab opens on: reuse this listing when it is the root.
  const archivos = loaded.kind === "ok" && !folderId ? filesCount(loaded.result) : undefined;
  const shell = await loadProjectTabShell(projectId, user, { archivos });
  if (!shell) {
    return <StateCard title="Carpeta no encontrada" message="El proyecto o la carpeta no existen." />;
  }

  // `ListPage` renders the tab's `EstiloSwitch` (FE §4.11), so `ProjectTabs` doesn't repeat it.
  return (
    <StyleProvider style={estilo ?? style} isOverridden={estilo !== null} scope="staff">
      <div className="flex flex-col gap-4">
        <ProjectTabs
          project={shell.project}
          active="archivos"
          counts={shell.counts}
          canManagePortal={shell.canManagePortal}
        />
        {loaded.kind === "drive_error" ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudo leer la carpeta en Drive.</AlertTitle>
            <AlertDescription>Intenta de nuevo en unos minutos.</AlertDescription>
          </Alert>
        ) : (
          <ProjectFiles
            projectId={projectId}
            result={loaded.result}
            canRetry={resolveProjectsCapabilities(user).canEditProjectGeneral}
          />
        )}
      </div>
    </StyleProvider>
  );
}
