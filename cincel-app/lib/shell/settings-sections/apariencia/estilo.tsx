/**
 * Settings section "Estilo de presentación" of /ajustes/apariencia (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function AparienciaEstiloSection() {
  return null;
}

export const aparienciaEstiloSection: SettingsSectionEntry = {
  page: "apariencia",
  name: "estilo",
  order: 20,
  visible: () => false,
  Component: AparienciaEstiloSection,
};
