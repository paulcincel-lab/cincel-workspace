import { TramosClient } from "./TramosClient";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesTramos } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { ajustesTramosOptions, seedAjustesCatalogs, type AjustesTramosPageData } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Tramos y fases (redesign FE §3.8, §21.2): Project Flow's "Tramos y
 * fases" page rendered inside Ajustes. Administrador only (today's rule),
 * checked by the segment layout and here. Prefetches
 * `qk.ajustes.page('tramos')` (and seeds `catalog.workflows`), so the client
 * makes no call on mount.
 */
export default async function AjustesTramosPage() {
  await requireSettingsAdminPage();
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesTramosOptions(), () => loadAjustesTramos(user));
  const data = qc.getQueryData<AjustesTramosPageData>(qk.ajustes.page("tramos"));
  if (data) seedAjustesCatalogs(qc, { seg: "tramos", data });

  return (
    <Hydrate qc={qc}>
      <TramosClient />
    </Hydrate>
  );
}
