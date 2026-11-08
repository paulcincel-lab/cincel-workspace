import { redirect } from "next/navigation";

import { GoogleSetupWizard } from "@/components/configuracion/GoogleSetupWizard";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { loadAjustesGoogle } from "@/lib/loaders/ajustes";
import { isBootstrapAdminEmail } from "@/lib/onboarding/first-login";
import { Hydrate } from "@/lib/query/hydrate";
import { ajustesGoogleOptions } from "@/lib/query/options/ajustes";
import { getQueryClient, prefetch } from "@/lib/query/server";

export const dynamic = "force-dynamic";

/**
 * First-login Google setup wizard of the bootstrap admin (#671) under Ajustes
 * (redesign FE §2.2, §3.10). The wizard and its stepper are unchanged here
 * (restyled in Phase 8). Administrador only; any other admin goes to
 * Ajustes › Google instead, as before. Shares `qk.ajustes.page('google')`
 * with Ajustes › Google.
 */
export default async function AjustesGoogleSetupWizardPage() {
  const user = await requireSettingsAdminPage();
  if (!isBootstrapAdminEmail(user.email)) redirect("/ajustes/google");

  const qc = getQueryClient();
  await prefetch(qc, ajustesGoogleOptions(), () => loadAjustesGoogle(user));
  return (
    <Hydrate qc={qc}>
      <GoogleSetupWizard />
    </Hydrate>
  );
}
