"use client";

import { useCallback, type ReactNode } from "react";
import { notFound, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import PortalFileBrowser from "@/components/portal/PortalFileBrowser";
import PortalProjectOverview from "@/components/portal/PortalProjectOverview";
import PortalProjectTabs, { pushPortalHref } from "@/components/portal/PortalProjectTabs";
import PortalSchedule from "@/components/portal/PortalSchedule";
import PortalUploader from "@/components/portal/PortalUploader";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { buildPortalOverview } from "@/lib/portal/overview";
import { parsePortalProjectTab, portalProjectFolderHref } from "@/lib/portal/project-tabs";
import { portalProjectOptions } from "@/lib/query/options/portal";

/** Today in Mexico City as `YYYY-MM-DD`, the reference for "próximas entregas". */
export function todayInMexico(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(now);
}

function Loading() {
  return (
    <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      Cargando…
    </p>
  );
}

/** First client load of the Resumen: the status line plus placeholders for the hero, the phases and the documents. */
function ResumenSkeleton() {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-[1240px] flex-col gap-6 px-4 pt-6 pb-12 sm:px-8">
      <Loading />
      <div aria-hidden="true" className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Skeleton className="h-[300px] rounded-[14px] lg:col-span-2" />
        <Skeleton className="h-[300px] rounded-[14px]" />
      </div>
      <Skeleton aria-hidden="true" className="h-32 rounded-[14px]" />
      <div aria-hidden="true" className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-[14px]" />
        ))}
      </div>
    </div>
  );
}

/** The other tabs keep the single 768 px column. */
function Column({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4 px-4 py-6">{children}</div>;
}

/**
 * `/portal/proyectos/[id]` body (FE §3.3): tabs and the active tab, from `portal.project(id, tab)`. The project
 * switcher lives in the top bar (`PortalProjectMenu`); the home stays reachable through the logo.
 * The server page seeds the tab it was opened on; the tab (`?tab=`) and the Archivos folder (`?folder=`) live
 * in the URL and change through `history.pushState`, so a tab already in the cache shows without a request.
 * While a new tab loads, the previous tab's project keeps the header in place.
 *
 * Resumen is `PortalProjectOverview` (FE §3.11): one set of data for the layout of the style the portal layout
 * resolved from `cincel-portal-style`; that layout sets the width (1240 px Visual / Analítico, 760 px Esencial).
 * Cronograma, Archivos and Enviar keep the 768 px column with the project's name.
 */
export default function PortalProjectView({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const active = parsePortalProjectTab(searchParams?.get("tab") ?? undefined);
  const folderId = searchParams?.get("folder") || null;
  const query = useQuery({ ...portalProjectOptions(projectId, active), placeholderData: keepPreviousData });

  const openFolder = useCallback(
    (id: string) => pushPortalHref(null, portalProjectFolderHref(projectId, id)),
    [projectId]
  );

  if (query.isError && !query.data) throw query.error;
  const data = query.data;
  // No access (revoked meanwhile, another client's project): a 404, never a 403.
  if (data === null) notFound();

  const project = data?.project ?? null;
  /** Resumen and Cronograma read the tab's own data; Archivos and Enviar have their own queries. */
  const waiting = !data || (query.isPlaceholderData && (active === "resumen" || active === "cronograma"));

  const tabs = <PortalProjectTabs projectId={projectId} active={active} />;

  if (active === "resumen") {
    // Resumen: the tabs on the wide frame; the active style's layout sets the width of what follows.
    return (
      <div className="flex min-w-0 flex-col">
        <div className="mx-auto w-full min-w-0 max-w-[1240px] px-4 pt-6 sm:px-8 sm:pt-7">{tabs}</div>
        {waiting || !data ? (
          <ResumenSkeleton />
        ) : (
          <PortalProjectOverview
            project={data.project}
            data={buildPortalOverview({
              project: data.project,
              schedule: data.schedule,
              etapas: data.etapas,
              files: data.documents,
              folders: data.documentFolders,
              team: data.team,
              today: todayInMexico(),
              updatedAt: query.dataUpdatedAt,
            })}
          />
        )}
      </div>
    );
  }

  return (
    <Column>
      {project ? (
        <header className="flex min-w-0 flex-col gap-1">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.code ? <p className="text-sm text-muted-foreground">{project.code}</p> : null}
        </header>
      ) : null}
      {tabs}
      {active === "archivos" ? (
        <PortalFileBrowser projectId={projectId} folderId={folderId} onOpenFolder={openFolder} />
      ) : active === "enviar" ? (
        <PortalUploader projectId={projectId} />
      ) : waiting || !data ? (
        <Loading />
      ) : (
        <PortalSchedule schedule={data.schedule} />
      )}
    </Column>
  );
}
