import { EstatusSettings } from "@/components/ajustes/EstatusSettings";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesEstatus } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesEstatusOptions, seedAjustesCatalogs, type AjustesEstatusPageData } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";
import { qk } from "@/lib/query/keys";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Estatus (redesign FE §3.8): the custom task statuses editor. The
 * segment layout guards it; the Ajustes layout renders the header and
 * `AjustesNav`. Prefetches `qk.ajustes.page('estatus')` (and seeds
 * `catalog.taskStatuses`), so the client makes no call on mount.
 */
export default async function AjustesEstatusPage() {
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesEstatusOptions(), () => loadAjustesEstatus(user));
  const data = qc.getQueryData<AjustesEstatusPageData>(qk.ajustes.page("estatus"));
  if (data) seedAjustesCatalogs(qc, { seg: "estatus", data });

  return (
    <Hydrate qc={qc}>
      <EstatusSettings />
    </Hydrate>
  );
}
