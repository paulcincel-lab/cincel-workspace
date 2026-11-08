import { GoogleSettings } from "@/components/ajustes/GoogleSettings";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { loadAjustesGoogle } from "@/lib/loaders/ajustes";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesGoogleOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Google (redesign FE §3.8): the existing Google settings and group
 * mappings, restyled. Administrador only (today's rule), checked by the
 * segment layout, here and again by the loader and every action.
 *
 * Prefetches `qk.ajustes.page('google')`: mappings, puestos and Estado in one
 * `Promise.all` (no waterfall), and hydrates it.
 */
export default async function AjustesGooglePage() {
  const user = await requireSettingsAdminPage();
  const qc = getQueryClient();
  await prefetch(qc, ajustesGoogleOptions(), () => loadAjustesGoogle(user));
  return (
    <Hydrate qc={qc}>
      <GoogleSettings />
    </Hydrate>
  );
}
