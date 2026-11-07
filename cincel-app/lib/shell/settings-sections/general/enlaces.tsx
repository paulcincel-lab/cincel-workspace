/**
 * Settings section "Enlaces del menú de usuario (Instagram, Sitio web, Correo)" of /ajustes/general (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function GeneralEnlacesSection() {
  return null;
}

export const generalEnlacesSection: SettingsSectionEntry = {
  page: "general",
  name: "enlaces",
  order: 10,
  visible: () => false,
  Component: GeneralEnlacesSection,
};
