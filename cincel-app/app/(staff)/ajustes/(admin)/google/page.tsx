import { GoogleSettings } from "@/components/ajustes/GoogleSettings";
import { fetchPositionsAction } from "@/lib/actions/positions-actions";
import { getGoogleHealthAction, listGroupMappingsAction } from "@/lib/actions/workspace-access-actions";
import { requireSettingsAdminPage } from "@/lib/auth/settings-admin-page";
import type { GoogleHealth, GroupMapping } from "@/lib/types/workspace-access";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Ajustes › Google (redesign FE §3.8): the existing Google settings and group
 * mappings, restyled. Administrador only (today's rule), checked by the
 * segment layout, here and again by every action. New-only route: with the
 * redesign off it redirects to the legacy `/configuracion/google`.
 */
export default async function AjustesGooglePage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  await redirectIfRedesignOff("/ajustes/google", searchParams ? await searchParams : undefined);
  await requireSettingsAdminPage();

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
    // Lost the session mid-request: nothing is loaded and the actions report their own errors.
  }
  try {
    health = await getGoogleHealthAction();
  } catch {
    // The health query failed: Estado shows its error state.
  }

  return <GoogleSettings mappings={mappings} positions={positions} health={health} />;
}
