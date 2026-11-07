import { AparienciaClient } from "@/components/ajustes/AparienciaClient";
import { fetchOrgAppearanceAction } from "@/lib/actions/org-appearance-actions";
import { fetchMyPreferencesAction } from "@/lib/actions/preferences-actions";
import { canManageAppearance } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { settingsSectionsFor } from "@/lib/shell/settings-sections";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Apariencia (redesign FE §3.8): theme, presentation style, mode,
 * density, text size, live preview and the "Nuevo diseño" switch. Personal
 * page (staff session only); the Ajustes layout renders the header and
 * `AjustesNav`. New-only route: with the redesign off it redirects to the
 * legacy equivalent.
 */
export default async function AjustesAparienciaPage() {
  await redirectIfRedesignOff("/ajustes/apariencia");

  const user = await requireCapabilityUser();
  const [preferences, org] = await Promise.all([fetchMyPreferencesAction(), fetchOrgAppearanceAction()]);
  const sections = settingsSectionsFor("apariencia", user);

  return (
    <AparienciaClient preferences={preferences} org={org} isAdmin={canManageAppearance(user)}>
      {sections.map(({ name, Component }) => (
        <Component key={name} />
      ))}
    </AparienciaClient>
  );
}
