import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import PortalFileBrowser from "@/components/portal/PortalFileBrowser";
import PortalProjectOverview from "@/components/portal/PortalProjectOverview";
import PortalProjectSummary from "@/components/portal/PortalProjectSummary";
import PortalProjectTabs from "@/components/portal/PortalProjectTabs";
import PortalSchedule from "@/components/portal/PortalSchedule";
import PortalUploader from "@/components/portal/PortalUploader";
import { isPortalNotFound } from "@/lib/portal/drive-guard";
import { listPortalFolder } from "@/lib/portal/files";
import { buildPortalOverview } from "@/lib/portal/overview";
import { parsePortalProjectTab } from "@/lib/portal/project-tabs";
import { getPortalProject, getPortalProjectTramos, getPortalSchedule } from "@/lib/portal/queries";
import { requirePortalUser, requireProjectAccess, type PortalProjectAccess } from "@/lib/portal/session";
import { getPortalPresentation } from "@/lib/portal/style-server";
import type { PortalFileDTO } from "@/lib/types/portal";
import { cn } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; folder?: string | string[] }>;
};

/** Today in Mexico City as `YYYY-MM-DD`, the reference for "próximas entregas". */
function todayInMexico(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(now);
}

/**
 * Files at the top of the project's `02 Cliente` folder, or null when there is nothing to list yet (folders not
 * ready) or Drive can't be read: the page then has no documents section (the Archivos tab explains the state).
 */
async function loadSharedDocuments(access: PortalProjectAccess): Promise<PortalFileDTO[] | null> {
  if (access.driveFolderStatus !== "ready" || !access.driveClientFolderId) return null;
  try {
    return (await listPortalFolder({ driveClientFolderId: access.driveClientFolderId })).items;
  } catch (error) {
    if (!isPortalNotFound(error)) console.error("[portal] could not list the shared documents", error);
    return null;
  }
}

/**
 * `/portal/proyectos/[id]` (FE §3.3): read-only project detail for a client. Tabs live in `?tab=`.
 * A project the client has no active access to (unknown, revoked, another client's) is a 404, never a 403.
 *
 * With the redesign on, Resumen is `PortalProjectOverview` (FE §3.11): one set of data for the library widgets,
 * which render it in the style the portal layout resolved from `cincel-portal-style`. With it off, the page
 * renders exactly as before.
 */
export default async function PortalProjectPage({ params, searchParams }: PageProps) {
  const [{ id }, { tab, folder }] = await Promise.all([params, searchParams]);
  const user = await requirePortalUser();
  let access: PortalProjectAccess;
  try {
    access = await requireProjectAccess(id, user);
  } catch (error) {
    if (isPortalNotFound(error)) notFound();
    throw error;
  }

  const active = parsePortalProjectTab(tab);
  const { redesignEnabled } = await getPortalPresentation();
  const styled = redesignEnabled && active === "resumen";
  const [project, schedule, tramos, documents] = await Promise.all([
    getPortalProject(user.id, id),
    active === "cronograma" || styled ? getPortalSchedule(user.id, id) : Promise.resolve(null),
    styled ? getPortalProjectTramos(user.id, id) : Promise.resolve([]),
    styled ? loadSharedDocuments(access) : Promise.resolve(null),
  ]);
  if (!project) notFound();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link href="/portal" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" />
        Mis proyectos
      </Link>
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className={cn("break-words text-2xl tracking-tight", redesignEnabled ? "font-semibold" : "font-bold")}>{project.name}</h1>
        {project.code ? <p className="text-sm text-muted-foreground">{project.code}</p> : null}
      </header>
      <PortalProjectTabs projectId={project.id} active={active} />
      {active === "cronograma" ? (
        <PortalSchedule schedule={schedule} />
      ) : active === "archivos" ? (
        <PortalFileBrowser projectId={project.id} initialFolderId={(Array.isArray(folder) ? folder[0] : folder) || null} />
      ) : active === "enviar" ? (
        <PortalUploader projectId={project.id} />
      ) : styled ? (
        <PortalProjectOverview
          project={project}
          data={buildPortalOverview({ project, schedule, tramos, files: documents, today: todayInMexico() })}
        />
      ) : (
        <PortalProjectSummary project={project} />
      )}
    </div>
  );
}
