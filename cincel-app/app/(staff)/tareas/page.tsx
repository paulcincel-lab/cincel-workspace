import { notFound } from "next/navigation";

import { TareasClient } from "@/components/tareas/TareasClient";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadTareasPage, prefetchTareasCalendar } from "@/lib/loaders/tareas";
import { Hydrate } from "@/lib/query/hydrate";
import { seedTareasPage, tareasPageKeyInputOf, tareasPageOptions } from "@/lib/query/options/tareas";
import { getQueryClient, prefetch } from "@/lib/query/server";
import type { TareasPageData } from "@/lib/tareas/page-data";
import { parseTareasQuery, toUrlSearchParams } from "@/lib/tareas/query";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `/tareas` (redesign FE §2.1, §3.4; Query Migration 4a): checks the viewer,
 * prefetches the view's bundle (`qk.tareas.page(q)`) by calling
 * `loadTareasPage` directly (no action POST), seeds the keys the views read
 * (`tareas.facets/board/list(f)`), and for Calendario its first range, then
 * hands the cache to `TareasClient` through `<Hydrate>`. No data props: the
 * client reads the query from the URL and every view its own key. The style
 * (and a `?estilo=` preview) comes from the appearance store and the URL.
 */
export default async function TareasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;

  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user).canViewActivities) notFound();

  const query = parseTareasQuery(toUrlSearchParams(raw));
  const key = tareasPageKeyInputOf(query);
  const options = tareasPageOptions(key);

  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, options, () => loadTareasPage(user, key)),
    query.vista === "calendario" ? prefetchTareasCalendar(qc, user, query) : undefined,
  ]);
  // The loader's bundle goes into the view keys; the page key keeps it without the rows.
  const data = qc.getQueryData<TareasPageData>(options.queryKey);
  if (data) qc.setQueryData(options.queryKey, seedTareasPage(qc, key, data));

  return (
    <Hydrate qc={qc}>
      <TareasClient />
    </Hydrate>
  );
}
