import { AjustesGeneralClient } from "@/components/ajustes/AjustesGeneralClient";
import { fetchGeneralSettingsAction } from "@/lib/actions/app-settings-actions";
import { canManageAppearance, canManageGeneralSettings } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { settingsSectionsFor } from "@/lib/shell/settings-sections";

export const dynamic = "force-dynamic";

/**
 * Ajustes › General (redesign FE §3.8, frame `AjustesGeneral`): company data,
 * regional settings, system info and the avatar-menu links. The segment layout
 * guards it with `canManageGeneralSettings`; the Ajustes layout renders
 * `AjustesNav`.
 */
export default async function AjustesGeneralPage() {
  const user = await requireCapabilityUser();
  const general = await fetchGeneralSettingsAction();
  const sections = settingsSectionsFor("general", user);

  return (
    <AjustesGeneralClient
      general={general}
      canManage={canManageGeneralSettings(user)}
      canManageAppearance={canManageAppearance(user)}
    >
      {sections.map(({ name, Component }) => (
        <Component key={name} />
      ))}
    </AjustesGeneralClient>
  );
}
