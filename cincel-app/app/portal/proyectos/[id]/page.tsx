import { notFound } from "next/navigation";

import PortalProjectView from "@/components/portal/PortalProjectView";
import { loadPortalProjectData } from "@/lib/loaders/portal";
import { parsePortalProjectTab } from "@/lib/portal/project-tabs";
import { requirePortalUser } from "@/lib/portal/session";
import { Hydrate } from "@/lib/query/hydrate";
import { portalProjectOptions } from "@/lib/query/options/portal";
import { getQueryClient, prefetch } from "@/lib/query/server";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[]; folder?: string | string[] }>;
};

/**
 * `/portal/proyectos/[id]` (FE §3.3): read-only project detail for a client. Tabs live in `?tab=`.
 * A project the client has no active access to (unknown, revoked, another client's) is a 404, never a 403.
 *
 * One page-data read (Query Migration Phase 11): `loadPortalProjectData` checks access once and reads only
 * what the opened tab shows; it seeds `portal.project(id, tab)` and `PortalProjectView` renders from the cache.
 */
export default async function PortalProjectPage({ params, searchParams }: PageProps) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const user = await requirePortalUser();
  const active = parsePortalProjectTab(tab);

  const data = await loadPortalProjectData(user, { id, tab: active });
  if (!data) notFound();

  const qc = getQueryClient();
  await prefetch(qc, portalProjectOptions(id, active), async () => data);

  return (
    <Hydrate qc={qc}>
      <PortalProjectView projectId={id} />
    </Hydrate>
  );
}
