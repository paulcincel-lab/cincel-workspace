"use client";

import { useCallback } from "react";
import Link from "next/link";
import { notFound, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2 } from "lucide-react";

import PortalFileBrowser from "@/components/portal/PortalFileBrowser";
import PortalProjectOverview from "@/components/portal/PortalProjectOverview";
import PortalProjectTabs, { pushPortalHref } from "@/components/portal/PortalProjectTabs";
import PortalSchedule from "@/components/portal/PortalSchedule";
import PortalUploader from "@/components/portal/PortalUploader";
import { buildPortalOverview } from "@/lib/portal/overview";
import { parsePortalProjectTab, portalProjectFolderHref } from "@/lib/portal/project-tabs";
import { portalProjectOptions } from "@/lib/query/options/portal";

/** Today in Mexico City as `YYYY-MM-DD`, the reference for "próximas entregas". */
export function todayInMexico(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(now);
}

/**
 * `/portal/proyectos/[id]` body (FE §3.3): header, tabs and the active tab, from `portal.project(id, tab)`.
 * The server page seeds the tab it was opened on; the tab (`?tab=`) and the Archivos folder (`?folder=`) live
 * in the URL and change through `history.pushState`, so a tab already in the cache shows without a request.
 * While a new tab loads, the previous tab's project keeps the header in place.
 *
 * Resumen is `PortalProjectOverview` (FE §3.11): one set of data for the library widgets, which render it in the
 * style the portal layout resolved from `cincel-portal-style`.
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

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link href="/portal" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" />
        Mis proyectos
      </Link>
      {project ? (
        <header className="flex min-w-0 flex-col gap-1">
          <h1 className="break-words text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.code ? <p className="text-sm text-muted-foreground">{project.code}</p> : null}
        </header>
      ) : null}
      <PortalProjectTabs projectId={projectId} active={active} />
      {active === "archivos" ? (
        <PortalFileBrowser projectId={projectId} folderId={folderId} onOpenFolder={openFolder} />
      ) : active === "enviar" ? (
        <PortalUploader projectId={projectId} />
      ) : waiting || !data ? (
        <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Cargando…
        </p>
      ) : active === "cronograma" ? (
        <PortalSchedule schedule={data.schedule} />
      ) : (
        <PortalProjectOverview
          project={data.project}
          data={buildPortalOverview({
            project: data.project,
            schedule: data.schedule,
            tramos: data.tramos,
            files: data.documents,
            today: todayInMexico(),
          })}
        />
      )}
    </div>
  );
}
