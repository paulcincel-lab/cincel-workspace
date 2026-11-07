/**
 * Settings section "Cambiar contraseña" of /ajustes/perfil (redesign FE §3.8, §21.1; Phase 6).
 *
 * The existing password change (`changePasswordAction`) with the same copy as `/profile`.
 */
import { PerfilContrasena } from "@/components/ajustes/PerfilClient";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const perfilContrasenaSection: SettingsSectionEntry = {
  page: "perfil",
  name: "contrasena",
  order: 40,
  visible: () => true,
  Component: PerfilContrasena,
};
