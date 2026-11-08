import { AparienciaClient } from "@/components/ajustes/AparienciaClient";
import { fetchOrgAppearanceAction } from "@/lib/actions/org-appearance-actions";
import { fetchMyPreferencesAction } from "@/lib/actions/preferences-actions";
import { canManageAppearance } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { APARIENCIA_SECTIONS } from "@/lib/shell/settings-sections/apariencia";
import { visibleSettingsSections } from "@/lib/shell/settings-sections/visible";

export const dynamic = "force-dynamic";

/**
 * Ajustes › Apariencia (redesign FE §3.8): theme, presentation style, mode,
 * density, text size and live preview. Personal
 * page (staff session only); the Ajustes layout renders the header and
 * `AjustesNav`.
 */
export default async function AjustesAparienciaPage() {

  const user = await requireCapabilityUser();
  const [preferences, org] = await Promise.all([fetchMyPreferencesAction(), fetchOrgAppearanceAction()]);
  const sections = visibleSettingsSections(APARIENCIA_SECTIONS, user);

  return (
    <AparienciaClient preferences={preferences} org={org} isAdmin={canManageAppearance(user)}>
      {sections.map(({ name, Component }) => (
        <Component key={name} />
      ))}
    </AparienciaClient>
  );
}
