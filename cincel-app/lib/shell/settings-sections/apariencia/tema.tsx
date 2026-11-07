/**
 * Settings section "Tema" of /ajustes/apariencia (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function AparienciaTemaSection() {
  return null;
}

export const aparienciaTemaSection: SettingsSectionEntry = {
  page: "apariencia",
  name: "tema",
  order: 10,
  visible: () => false,
  Component: AparienciaTemaSection,
};
