import GeneralSettingsWorkspace from "@/components/configuracion/GeneralSettingsWorkspace";
import {
  fetchAppearanceAction,
  fetchGeneralSettingsAction,
  type AppearanceState,
} from "@/lib/actions/app-settings-actions";
import { buildDefaultLoadedGeneralSettings, type LoadedGeneralSettings } from "@/lib/settings/general-settings";

export default async function ConfiguracionGeneralPage() {
  let appearance: AppearanceState = { primaryColor: null, canManage: false };
  let general: LoadedGeneralSettings = buildDefaultLoadedGeneralSettings();
  try {
    [appearance, general] = await Promise.all([fetchAppearanceAction(), fetchGeneralSettingsAction()]);
  } catch {
    // No session — the route guard sends the user to /login.
  }
  return <GeneralSettingsWorkspace appearance={appearance} general={general} />;
}
