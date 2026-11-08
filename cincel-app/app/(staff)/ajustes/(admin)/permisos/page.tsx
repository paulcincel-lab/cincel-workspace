import { PermisosSettings } from "@/components/ajustes/PermisosSettings";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesPermisos } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesPermisosOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Permisos (redesign FE §3.8, #950): a read-only summary of the
 * people per access with the default permissions, which are the ones the
 * server enforces. The segment layout guards it; the Ajustes layout renders
 * the header and `AjustesNav`. Prefetches `qk.ajustes.page('permisos')`.
 */
export default async function AjustesPermisosPage() {
  const user = await requireCapabilityUser();
  const qc = getQueryClient();
  await prefetch(qc, ajustesPermisosOptions(), () => loadAjustesPermisos(user));

  return (
    <Hydrate qc={qc}>
      <PermisosSettings />
    </Hydrate>
  );
}
