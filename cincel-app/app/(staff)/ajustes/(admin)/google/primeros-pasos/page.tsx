import { redirect } from "next/navigation";

import { GoogleSetupWizard } from "@/components/configuracion/GoogleSetupWizard";
import { fetchPositionsAction } from "@/lib/actions/positions-actions";
import { getGoogleHealthAction, listGroupMappingsAction } from "@/lib/actions/workspace-access-actions";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import { isBootstrapAdminEmail } from "@/lib/onboarding/first-login";
import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";

export const dynamic = "force-dynamic";

/**
 * First-login Google setup wizard of the bootstrap admin (#671) under Ajustes
 * (redesign FE §2.2, §3.10). The wizard and its stepper are unchanged here
 * (restyled in Phase 8). Administrador only; any other admin goes to
 * Ajustes › Google instead, as before.
 */
export default async function AjustesGoogleSetupWizardPage() {
  const user = await requireSettingsAdminPage();
  if (!isBootstrapAdminEmail(user.email)) redirect("/ajustes/google");

  let mappings: GroupMapping[] = [];
  let positions: { id: string; name: string }[] = [];
  let health: GoogleHealth | null = null;
  try {
    const [mappingRows, positionRows] = await Promise.all([listGroupMappingsAction(), fetchPositionsAction()]);
    mappings = mappingRows;
    positions = positionRows
      .filter((position) => position.active || position.googleManaged)
      .map((position) => ({ id: position.id, name: position.name }));
  } catch {
    // Lost the session mid-request: nothing is loaded.
  }
  try {
    health = await getGoogleHealthAction();
  } catch {
    // The health query failed: Revisión shows its error state and blocks Next.
  }

  return <GoogleSetupWizard health={health} mappings={mappings} positions={positions} />;
}
