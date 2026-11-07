/**
 * Settings section "Tamaño de texto" of /ajustes/apariencia (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function AparienciaTamanoTextoSection() {
  return null;
}

export const aparienciaTamanoTextoSection: SettingsSectionEntry = {
  page: "apariencia",
  name: "tamano-texto",
  order: 50,
  visible: () => false,
  Component: AparienciaTamanoTextoSection,
};
