import { CalendarioClient } from "@/components/calendario/CalendarioClient";
import { PermissionDenied } from "@/components/shell/PermissionDenied";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { defaultCalVista, readsRowList } from "@/lib/calendario/labels";
import { parseCalendarioQuery, rangeInputOf } from "@/lib/calendario/url-state";
import { loadCatalogProjectOptions, loadCatalogWorkflows } from "@/lib/loaders/catalog";
import { loadCalendarioList, loadCalendarioRange } from "@/lib/loaders/calendario";
import { Hydrate } from "@/lib/query/hydrate";
import { calendarioListInfiniteOptions, calendarioRangeOptions } from "@/lib/query/options/calendario";
import { catalogProjectOptionsOptions, catalogTramosOptions } from "@/lib/query/options/catalog";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { localDate } from "@/lib/time-tracking/local-time";
import { DEFAULT_HIDE_COMPLETED_TASKS } from "@/lib/ui/preferences";
import { getMyPreferences, getResolvedAppearance, getStoredOrgAppearance } from "@/lib/ui/preferences-server";
import { readEstiloOverride, resolvePageStyle } from "@/lib/ui/style-override";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * /calendario (Calendario FE §2.1, §9.3): checks `canViewCalendar`, resolves the
 * Estilo, reads the query of the URL with the Estilo's default vista (F3), and
 * prefetches the range (Analítico also the first page of rows) and the catalogs
 * the filters need by calling the loaders directly (no action POST). The client
 * gets the cache through `<Hydrate>`, with no data props: it reads the same
 * query from the URL, so nothing is requested on first paint.
 */
export default async function CalendarioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;

  const user = await requireCapabilityUser();
  if (!resolveCalendarCapabilities(user).canViewCalendar) return <PermissionDenied />;

  const [appearance, org, preferences] = await Promise.all([getResolvedAppearance(), getStoredOrgAppearance(), getMyPreferences()]);
  const { style } = resolvePageStyle({
    override: readEstiloOverride(raw),
    chosen: appearance.style,
    styleDefault: org.styleDefault,
    allowUserOverride: org.allowUserOverride,
  });

  // The same defaults the client builds: the Estilo's vista, today and "Ocultar completadas".
  const query = parseCalendarioQuery(raw, {
    vista: defaultCalVista(style),
    today: localDate(new Date()),
    ocultarCompletadas: preferences?.hideCompletedTasks ?? DEFAULT_HIDE_COMPLETED_TASKS,
  });
  const input = rangeInputOf(query);

  const qc = getQueryClient();
  await Promise.all([
    prefetch(qc, calendarioRangeOptions(input), () => loadCalendarioRange(user, input)),
    prefetch(qc, catalogTramosOptions(), () => loadCatalogWorkflows()),
    prefetch(qc, catalogProjectOptionsOptions(), () => loadCatalogProjectOptions(user)),
    readsRowList(style)
      ? qc.prefetchInfiniteQuery({
          ...calendarioListInfiniteOptions({ from: input.from, to: input.to, filters: input.filters, orderDir: "asc" }),
          queryFn: () => loadCalendarioList(user, { from: input.from, to: input.to, filters: input.filters, orderDir: "asc", cursor: null }),
        })
      : Promise.resolve(),
  ]);

  return (
    <Hydrate qc={qc}>
      <CalendarioClient />
    </Hydrate>
  );
}
