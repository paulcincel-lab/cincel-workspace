/**
 * Settings section "Estilo de presentación" of /ajustes/apariencia (redesign FE §3.8, §21.1; Phase 6).
 * Every staff member sees it once `updateMyPreferencesAction` is implemented;
 * the state lives in the `useAppearance` store.
 */
import { AparienciaEstiloSection } from "@/components/ajustes/AparienciaSections";
import { IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const aparienciaEstiloSection: SettingsSectionEntry = {
  page: "apariencia",
  name: "estilo",
  order: 20,
  visible: () => IMPLEMENTED.updateMyPreferencesAction,
  Component: AparienciaEstiloSection,
};
