/**
 * Settings section "Datos personales" of /ajustes/perfil (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function PerfilDatosSection() {
  return null;
}

export const perfilDatosSection: SettingsSectionEntry = {
  page: "perfil",
  name: "datos",
  order: 20,
  visible: () => false,
  Component: PerfilDatosSection,
};
