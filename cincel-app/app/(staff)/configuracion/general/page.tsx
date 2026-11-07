import GeneralSettingsWorkspace from "@/components/configuracion/GeneralSettingsWorkspace";
import {
  fetchAppearanceAction,
  fetchGeneralSettingsAction,
  type AppearanceState,
} from "@/lib/actions/app-settings-actions";
import { buildDefaultLoadedGeneralSettings, type LoadedGeneralSettings } from "@/lib/settings/general-settings";
import type { LegacyPageProps } from "@/lib/ui/legacy-redirects";
import { redirectLegacyIfRedesignOn } from "@/lib/ui/legacy-redirects-server";

export default async function ConfiguracionGeneralPage({ searchParams }: LegacyPageProps) {
  await redirectLegacyIfRedesignOn("/configuracion/general", searchParams);
  let appearance: AppearanceState = { primaryColor: null, canManage: false, canManageGeneral: false };
  let general: LoadedGeneralSettings = buildDefaultLoadedGeneralSettings();
  try {
    [appearance, general] = await Promise.all([fetchAppearanceAction(), fetchGeneralSettingsAction()]);
  } catch {
    // No session — the route guard sends the user to /login.
  }
  return <GeneralSettingsWorkspace appearance={appearance} general={general} />;
}
