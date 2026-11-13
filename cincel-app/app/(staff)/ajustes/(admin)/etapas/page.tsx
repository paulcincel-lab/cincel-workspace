import { EtapasClient } from "./EtapasClient";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesEtapas } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { ajustesEtapasOptions, seedAjustesCatalogs, type AjustesEtapasPageData } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Etapas y fases (redesign FE §3.8, §21.2): Project Flow's "Etapas y
 * fases" page rendered inside Ajustes. Administrador only (today's rule),
 * checked by the segment layout and here. Prefetches
 * `qk.ajustes.page('etapas')` (and seeds `catalog.workflows`), so the client
 * makes no call on mount.
 */
export default async function AjustesEtapasPage() {
  await requireSettingsAdminPage();
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesEtapasOptions(), () => loadAjustesEtapas(user));
  const data = qc.getQueryData<AjustesEtapasPageData>(qk.ajustes.page("etapas"));
  if (data) seedAjustesCatalogs(qc, { seg: "etapas", data });

  return (
    <Hydrate qc={qc}>
      <EtapasClient />
    </Hydrate>
  );
}
