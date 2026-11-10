/**
 * Settings section "Densidad" of /ajustes/apariencia (redesign FE §3.8, §21.1; Phase 6).
 * Every staff member sees it once `updateMyPreferencesAction` is implemented;
 * the state lives in the `useAppearance` store.
 */
import { AparienciaDensidadSection } from "@/components/ajustes/AparienciaSections";
import { IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const aparienciaDensidadSection: SettingsSectionEntry = {
  page: "apariencia",
  name: "densidad",
  order: 50,
  visible: () => IMPLEMENTED.updateMyPreferencesAction,
  Component: AparienciaDensidadSection,
};
