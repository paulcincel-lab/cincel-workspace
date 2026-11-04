import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import PortalProjectSummary from "@/components/portal/PortalProjectSummary";
import PortalProjectTabs, { parsePortalProjectTab } from "@/components/portal/PortalProjectTabs";
import PortalSchedule from "@/components/portal/PortalSchedule";
import { isPortalNotFound } from "@/lib/portal/drive-guard";
import { getPortalProject, getPortalSchedule } from "@/lib/portal/queries";
import { requirePortalUser, requireProjectAccess } from "@/lib/portal/session";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

/**
 * `/portal/proyectos/[id]` (FE §3.3): read-only project detail for a client. Tabs live in `?tab=`.
 * A project the client has no active access to (unknown, revoked, another client's) is a 404, never a 403.
 */
export default async function PortalProjectPage({ params, searchParams }: PageProps) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const user = await requirePortalUser();
  try {
    await requireProjectAccess(id, user);
  } catch (error) {
    if (isPortalNotFound(error)) notFound();
    throw error;
  }

  const active = parsePortalProjectTab(tab);
  const [project, schedule] = await Promise.all([
    getPortalProject(user.id, id),
    active === "cronograma" ? getPortalSchedule(user.id, id) : Promise.resolve(null),
  ]);
  if (!project) notFound();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link href="/portal" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" />
        Mis proyectos
      </Link>
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="break-words text-2xl font-bold tracking-tight">{project.name}</h1>
        {project.code ? <p className="text-sm text-muted-foreground">{project.code}</p> : null}
      </header>
      <PortalProjectTabs projectId={project.id} active={active} />
      {active === "cronograma" ? <PortalSchedule schedule={schedule} /> : <PortalProjectSummary project={project} />}
    </div>
  );
}
