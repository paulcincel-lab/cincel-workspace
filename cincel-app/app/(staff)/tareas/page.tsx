import { notFound } from "next/navigation";

import { TareasClient } from "@/components/tareas/TareasClient";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadTareasPage } from "@/lib/loaders/tareas";
import { Hydrate } from "@/lib/query/hydrate";
import { seedTareasPage, tareasPageKeyInputOf, tareasPageOptions } from "@/lib/query/options/tareas";
import { getQueryClient, prefetch } from "@/lib/query/server";
import type { TareasPageData } from "@/lib/tareas/page-data";
import { parseTareasQuery, toUrlSearchParams } from "@/lib/tareas/query";
import { DEFAULT_HIDE_COMPLETED_TASKS } from "@/lib/ui/preferences";
import { getMyPreferences, getResolvedAppearance, getStoredOrgAppearance } from "@/lib/ui/preferences-server";
import { readEstiloOverride, resolvePageStyle } from "@/lib/ui/style-override";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/tareas` (redesign FE §2.1, §3.4; Query Migration 4a; Estilos ADR 0004):
 * checks the viewer, prefetches the layout's bundle (`qk.tareas.page(q)`) by
 * calling `loadTareasPage` directly (no action POST), seeds the keys the
 * layout reads (`tareas.facets/board/list(f)`), then hands the cache to
 * `TareasClient` through `<Hydrate>`. No data props: the client reads the
 * query from the URL and every part its own key. The bundle is keyed by the
 * same style the client renders: the `?estilo=` override when the
 * organization allows one, else the viewer's resolved style.
 */
export default async function TareasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;

  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canViewActivities) notFound();

  const [appearance, org, preferences] = await Promise.all([
    getResolvedAppearance(),
    getStoredOrgAppearance(),
    getMyPreferences(),
  ]);
  // A URL without `?completadas=` follows "Ocultar completadas" (the client reads the same preference).
  const query = parseTareasQuery(toUrlSearchParams(raw), {
    completadas: !(preferences?.hideCompletedTasks ?? DEFAULT_HIDE_COMPLETED_TASKS),
  });
  const { style } = resolvePageStyle({
    override: readEstiloOverride(raw),
    chosen: appearance.style,
    styleDefault: org.styleDefault,
    allowUserOverride: org.allowUserOverride,
  });
  const key = tareasPageKeyInputOf(query, style);
  const options = tareasPageOptions(key);

  const qc = getQueryClient();
  await prefetch(qc, options, () => loadTareasPage(user, key));
  // The loader's bundle goes into the view keys; the page key keeps it without the rows.
  const data = qc.getQueryData<TareasPageData>(options.queryKey);
  if (data) qc.setQueryData(options.queryKey, seedTareasPage(qc, key, data));

  return (
    <Hydrate qc={qc}>
      <TareasClient />
    </Hydrate>
  );
}
