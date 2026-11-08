import PortalHomeView from "@/components/portal/PortalHomeView";
import { loadPortalHomeData } from "@/lib/loaders/portal";
import { requirePortalUser } from "@/lib/portal/session";
import { Hydrate } from "@/lib/query/hydrate";
import { portalHomeOptions } from "@/lib/query/options/portal";
import { getQueryClient, prefetch } from "@/lib/query/server";

/**
 * Portal landing page (FE §3.2): one card per project the signed-in client can see, or the empty state.
 * One page-data read (Query Migration Phase 11) seeds `portal.projects()`; `PortalHomeView` renders from it.
 */
export default async function PortalHomePage() {
  const user = await requirePortalUser();
  const qc = getQueryClient();
  await prefetch(qc, portalHomeOptions(), () => loadPortalHomeData(user));

  return (
    <Hydrate qc={qc}>
      <PortalHomeView />
    </Hydrate>
  );
}
