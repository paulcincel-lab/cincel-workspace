import { redirect } from "next/navigation";

import { AjustesMondayScreen } from "@/components/ajustes/AjustesMondayScreen";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { loadAjustesMonday, type AjustesMondayPageData } from "@/lib/loaders/ajustes-monday";
import { isBootstrapAdminEmail } from "@/lib/onboarding/first-login";
import { Hydrate } from "@/lib/query/hydrate";
import { qk } from "@/lib/query/keys";
import { ajustesMondayOptions } from "@/lib/query/options/ajustes";
import { seedMondayQueries } from "@/lib/query/options/monday";
import { getQueryClient, prefetch } from "@/lib/query/server";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Importar de monday (redesign FE §3.8, frame `AjustesMonday`): the
 * import wizard (#672) between "Última importación" and "Historial".
 * Administrador only and never the bootstrap admin (today's rule), checked by
 * the segment layout, here and again by every action. The page only reads:
 * status, the latest run's state, the choices and the history come from one
 * loader into `ajustes.page('monday')`, which also seeds `monday.run(id)`,
 * `monday.choices()` and `monday.history()`. Opening a run is the wizard's
 * "Iniciar / Continuar importación" button (#966).
 */
export default async function AjustesMondayPage() {
  const user = await requireSettingsAdminPage();
  if (isBootstrapAdminEmail(user.email)) redirect("/ajustes/permisos");

  const qc = getQueryClient();
  await prefetch(qc, ajustesMondayOptions(), () => loadAjustesMonday(user));
  const data = qc.getQueryData<AjustesMondayPageData>(qk.ajustes.page("monday"));
  if (data) seedMondayQueries(qc, data);

  return (
    <Hydrate qc={qc}>
      <AjustesMondayScreen />
    </Hydrate>
  );
}
