import { redirect } from "next/navigation";

import { MiEspacioClient } from "@/components/mi-espacio/MiEspacioClient";
import { parseMiEspacioFilters } from "@/components/mi-espacio/search-params";
import { getSessionAccess, requireCapabilityUser } from "@/lib/auth/session";
import { loadMiEspacio } from "@/lib/loaders/mi-espacio";
import { myTasksSummaryInput } from "@/lib/my-space/my-tasks-summary";
import { Hydrate } from "@/lib/query/hydrate";
import { seedMiEspacio } from "@/lib/query/options/mi-espacio";
import { getQueryClient } from "@/lib/query/server";
import { TAREAS_COMPLETADAS_PARAM, parseCompletadasParam, toUrlSearchParams } from "@/lib/tareas/query";
import { getResolvedAppearance, getStoredOrgAppearance } from "@/lib/ui/preferences-server";
import { readEstiloOverride, resolvePageStyle } from "@/lib/ui/style-override";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw ? raw : null;
}

/**
 * /mi-espacio (redesign FE §3.3; Query Migration Phase 7, #941): the private
 * home of each staff member. One loader call reads the viewer's own rows
 * (owner-scoped on the server) and seeds the granular `me.*` keys, which the
 * client reads under `<Hydrate>`; mutations then patch that cache instead of
 * re-rendering the route. The tasks (#1051): the counts of the URL's
 * Analítico filters and the first page of what the rendered style shows
 * first (the board columns, the first Esencial cards or the first etapa
 * groups), never every task.
 */
export default async function MiEspacioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;

  const access = await getSessionAccess();
  if (!access.user) redirect("/login");

  const [user, appearance, org] = await Promise.all([
    requireCapabilityUser(),
    getResolvedAppearance(),
    getStoredOrgAppearance(),
  ]);
  const { style } = resolvePageStyle({
    override: readEstiloOverride(params),
    chosen: appearance.style,
    styleDefault: org.styleDefault,
    allowUserOverride: org.allowUserOverride,
  });
  const url = toUrlSearchParams(params);
  const filters = parseMiEspacioFilters(url);
  // Mi espacio hides closed tasks unless the URL says `?completadas=1`.
  const withClosed = parseCompletadasParam(url.get(TAREAS_COMPLETADAS_PARAM), false);

  const qc = getQueryClient();
  // Only Analítico narrows the counts by the URL's filters (the loader decides); Visual and Esencial count everything.
  const data = await loadMiEspacio(user, new Date(), {
    style,
    analiticoInput: myTasksSummaryInput({ etapa: filters.etapa, q: filters.q, retraso: filters.estado === "retraso" }),
    withClosed,
  });
  seedMiEspacio(qc, data);

  return (
    <Hydrate qc={qc}>
      <MiEspacioClient noteParam={first(params.nota)} canCreateTask={data.canCreateTask} />
    </Hydrate>
  );
}
