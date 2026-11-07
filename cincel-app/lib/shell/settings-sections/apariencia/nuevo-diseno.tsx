/**
 * Settings section "Nuevo diseño" of /ajustes/apariencia (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function AparienciaNuevoDisenoSection() {
  return null;
}

export const aparienciaNuevoDisenoSection: SettingsSectionEntry = {
  page: "apariencia",
  name: "nuevo-diseno",
  order: 60,
  visible: () => false,
  Component: AparienciaNuevoDisenoSection,
};
