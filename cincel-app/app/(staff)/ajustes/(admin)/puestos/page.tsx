import { PuestosClient } from "./PuestosClient";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesPuestos } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { ajustesPuestosOptions, seedAjustesCatalogs, type AjustesPuestosPageData } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Puestos (redesign FE §3.8, §21.2): Project Flow's "Puestos" page
 * rendered inside Ajustes. Administrador only (today's rule), checked by the
 * segment layout and here. Prefetches `qk.ajustes.page('puestos')` (and seeds
 * `catalog.workflows`), so the client makes no call on mount.
 */
export default async function AjustesPuestosPage() {
  await requireSettingsAdminPage();
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesPuestosOptions(), () => loadAjustesPuestos(user));
  const data = qc.getQueryData<AjustesPuestosPageData>(qk.ajustes.page("puestos"));
  if (data) seedAjustesCatalogs(qc, { seg: "puestos", data });

  return (
    <Hydrate qc={qc}>
      <PuestosClient />
    </Hydrate>
  );
}
