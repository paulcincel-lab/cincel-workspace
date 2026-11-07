/**
 * Settings section "Densidad" of /ajustes/apariencia (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function AparienciaDensidadSection() {
  return null;
}

export const aparienciaDensidadSection: SettingsSectionEntry = {
  page: "apariencia",
  name: "densidad",
  order: 40,
  visible: () => false,
  Component: AparienciaDensidadSection,
};
