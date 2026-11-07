/**
 * Settings section "Modo" of /ajustes/apariencia (redesign FE §3.8, §21.1; Phase 6).
 * Every staff member sees it once `updateMyPreferencesAction` is implemented;
 * the state lives in `AparienciaClient`.
 */
import { AparienciaModoSection } from "@/components/ajustes/AparienciaSections";
import { IMPLEMENTED } from "@/lib/actions/preferences-actions.flags";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const aparienciaModoSection: SettingsSectionEntry = {
  page: "apariencia",
  name: "modo",
  order: 30,
  visible: () => IMPLEMENTED.updateMyPreferencesAction,
  Component: AparienciaModoSection,
};
