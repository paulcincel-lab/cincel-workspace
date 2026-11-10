import { PermisosSettings } from "@/components/ajustes/PermisosSettings";
import { requireCapabilityUser } from "@/lib/auth/session";
import { loadAjustesPermisos } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesPermisosOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Permisos (redesign FE §3.8, #950, #971): the people per access
 * and the permission matrix the server enforces, editable by an
 * Administrador. The segment layout guards it; the Ajustes layout renders
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
