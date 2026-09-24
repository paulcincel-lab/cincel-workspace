import GeneralSettingsWorkspace from "@/components/configuracion/GeneralSettingsWorkspace";
import { fetchAppearanceAction, type AppearanceState } from "@/lib/actions/app-settings-actions";

export default async function ConfiguracionGeneralPage() {
  let appearance: AppearanceState = { primaryColor: null, canManage: false };
  try {
    appearance = await fetchAppearanceAction();
  } catch {
    // No session — the route guard sends the user to /login.
  }
  return <GeneralSettingsWorkspace appearance={appearance} />;
}
