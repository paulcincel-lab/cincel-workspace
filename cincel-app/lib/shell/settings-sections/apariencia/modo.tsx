/**
 * Settings section "Modo" of /ajustes/apariencia (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function AparienciaModoSection() {
  return null;
}

export const aparienciaModoSection: SettingsSectionEntry = {
  page: "apariencia",
  name: "modo",
  order: 30,
  visible: () => false,
  Component: AparienciaModoSection,
};
