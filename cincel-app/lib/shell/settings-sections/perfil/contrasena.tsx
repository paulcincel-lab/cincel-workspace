/**
 * Settings section "Cambiar contraseña" of /ajustes/perfil (redesign FE §3.8, §21.1; Phase 6).
 *
 * Contract stub: hidden until Phase 6 implements it.
 */
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

function PerfilContrasenaSection() {
  return null;
}

export const perfilContrasenaSection: SettingsSectionEntry = {
  page: "perfil",
  name: "contrasena",
  order: 40,
  visible: () => false,
  Component: PerfilContrasenaSection,
};
