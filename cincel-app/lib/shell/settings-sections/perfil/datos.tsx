/**
 * Settings section "Datos personales" of /ajustes/perfil (redesign FE §3.8, §21.1; Phase 6).
 *
 * The "Datos personales", "Firma" and "Idioma y región" cards and their save
 * bar: editable nombre, teléfono and firma de correo (saved through the
 * existing staff actions, which accept the caller's own fields); read-only
 * puesto, correo, idioma and zona horaria. Renders inside `PerfilClient`.
 */
import { PerfilDatos } from "@/components/ajustes/PerfilClient";
import type { SettingsSectionEntry } from "@/lib/shell/settings-sections";

export const perfilDatosSection: SettingsSectionEntry = {
  page: "perfil",
  name: "datos",
  order: 20,
  visible: () => true,
  Component: PerfilDatos,
};
