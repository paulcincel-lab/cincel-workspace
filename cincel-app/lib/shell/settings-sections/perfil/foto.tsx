/**
 * Settings section "Foto" of /ajustes/perfil (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function PerfilFotoSection() {
  return null;
}

export const perfilFotoSection: SettingsSectionEntry = {
  page: "perfil",
  name: "foto",
  order: 10,
  visible: () => false,
  Component: PerfilFotoSection,
};
