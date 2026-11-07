import { AjustesGeneralClient } from "@/components/ajustes/AjustesGeneralClient";
import { fetchAppearanceAction, fetchGeneralSettingsAction } from "@/lib/actions/app-settings-actions";
import { canManageGeneralSettings } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { settingsSectionsFor } from "@/lib/shell/settings-sections";
import { redirectIfRedesignOff } from "@/lib/ui/redesign-redirect";

export const dynamic = "force-dynamic";

/**
 * Ajustes › General (redesign FE §3.8, frame `AjustesGeneral`): company data,
 * regional settings, system info and the avatar-menu links. The segment layout
 * guards it with `canManageGeneralSettings`; the Ajustes layout renders
 * `AjustesNav`. New-only route: with the redesign off it redirects to the
 * legacy `/configuracion/general`.
 */
export default async function AjustesGeneralPage() {
  await redirectIfRedesignOff("/ajustes/general");
  const user = await requireCapabilityUser();
  const [appearance, general] = await Promise.all([fetchAppearanceAction(), fetchGeneralSettingsAction()]);
  const sections = settingsSectionsFor("general", user);

  return (
    <AjustesGeneralClient
      general={general}
      canManage={canManageGeneralSettings(user)}
      canManageAppearance={appearance.canManage}
    >
      {sections.map(({ name, Component }) => (
        <Component key={name} />
      ))}
    </AjustesGeneralClient>
  );
}
