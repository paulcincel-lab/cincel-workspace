import { FlujosClient } from "./FlujosClient";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesFlujos } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesFlujosOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Flujos (#1035): the catalog of flows, each with its etapas in
 * order and the fase that opens each etapa. Administrador only (the rule of
 * Etapas y fases), checked by the segment layout and here. Prefetches
 * `qk.ajustes.page('flujos')`, so the client makes no call on mount.
 */
export default async function AjustesFlujosPage() {
  await requireSettingsAdminPage();
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesFlujosOptions(), () => loadAjustesFlujos(user));

  return (
    <Hydrate qc={qc}>
      <FlujosClient />
    </Hydrate>
  );
}
